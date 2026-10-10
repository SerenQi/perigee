const { readFileSync, writeFileSync } = require('fs');
const { randomUUID } = require('crypto');
const config = require('./lib/config');

const DEFAULTS = {
  openrouter: { label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['anthropic/claude-opus-4.6', 'anthropic/claude-sonnet-4.6'] },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'] },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-5.4', 'gpt-5.4-mini'] },
  // Claude 官方 API：走同一个 Claude Code 进程，只是带上这把 key
  anthropic: { label: 'Claude 官方 API', baseUrl: 'https://api.anthropic.com', models: ['claude-opus-5-5'] },
};

// 设置页没填 key 时的兜底：环境变量（见 .env.example）
const ENV_KEYS = {
  anthropic: config.ANTHROPIC_API_KEY,
  openrouter: config.OPENROUTER_API_KEY,
  deepseek: config.DEEPSEEK_API_KEY,
  openai: config.OPENAI_API_KEY,
};

function safeBaseUrl(value, fallback) {
  const raw = String(value || fallback).trim().replace(/\/+$/, '');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Base URL 格式不对'); }
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Base URL 必须使用 HTTPS');
  return raw;
}

function createChannelHub({ settingsFile, history, appendHistory, pushBark }) {
  const active = new Map();
  function readSettings() {
    let saved = {};
    try { saved = JSON.parse(readFileSync(settingsFile, 'utf8')); } catch {}
    const providers = {};
    for (const [id, defaults] of Object.entries(DEFAULTS)) {
      const item = saved[id] && typeof saved[id] === 'object' ? saved[id] : {};
      providers[id] = {
        ...defaults,
        baseUrl: String(item.baseUrl || defaults.baseUrl),
        models: (Array.isArray(item.models) ? item.models : item.model ? [item.model] : defaults.models)
          .map(value => String(value).trim()).filter(Boolean).slice(0, 20),
        apiKey: String(String(item.apiKey || '').trim() || ENV_KEYS[id] || ''),
      };
    }
    return providers;
  }

  function publicProviders() {
    return Object.entries(readSettings()).map(([id, item]) => ({
      id, label: item.label, configured: Boolean(item.apiKey), baseUrl: item.baseUrl,
      model: item.models[0], models: item.models,
    }));
  }

  function saveProvider(id, input) {
    if (!DEFAULTS[id]) throw new Error('未知 API 提供方');
    const current = readSettings();
    const provider = current[id];
    const apiKey = input.clearKey ? '' : (String(input.apiKey || '').trim() || provider.apiKey);
    const baseUrl = safeBaseUrl(input.baseUrl, provider.baseUrl);
    const models = (Array.isArray(input.models) ? input.models : input.model ? [input.model] : provider.models)
      .map(value => String(value).trim().slice(0, 160)).filter(Boolean).filter((value, index, all) => all.indexOf(value) === index).slice(0, 20);
    if (!models.length) throw new Error('至少填写一个模型');
    const stored = {};
    for (const providerId of Object.keys(DEFAULTS)) {
      const source = providerId === id ? { ...current[providerId], apiKey, baseUrl, models } : current[providerId];
      stored[providerId] = { apiKey: source.apiKey, baseUrl: source.baseUrl, models: source.models };
    }
    writeFileSync(settingsFile, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
    return publicProviders().find(item => item.id === id);
  }

  function channels(codexAvailable) {
    const p = readSettings();
    return [
      { id: 'claude-subscription', label: 'Claude 订阅', note: '默认 · 免费', configured: true, available: true },
      { id: 'claude-api', label: 'Claude API', note: 'API 额度', configured: Boolean(p.anthropic.apiKey), available: Boolean(p.anthropic.apiKey) },
      { id: 'claude-openrouter', label: 'Claude via OR 网关', note: '大上下文', configured: Boolean(p.openrouter.apiKey), available: Boolean(p.openrouter.apiKey), models: p.openrouter.models.map(id => ({ id, label: id })) },
      { id: 'codex', label: 'Codex', note: '订阅', configured: codexAvailable, available: codexAvailable },
      { id: 'deepseek', label: 'DeepSeek API 直连', note: 'API', configured: Boolean(p.deepseek.apiKey), available: Boolean(p.deepseek.apiKey), models: p.deepseek.models.map(id => ({ id, label: id === 'deepseek-chat' ? 'DeepSeek V3' : id === 'deepseek-reasoner' ? 'DeepSeek R1' : id })) },
      { id: 'chatgpt', label: 'ChatGPT', note: 'OpenAI API', configured: Boolean(p.openai.apiKey), available: Boolean(p.openai.apiKey), models: p.openai.models.map(id => ({ id, label: id })) },
    ];
  }

  function providerForChannel(channel, requestedModel) {
    const providers = readSettings();
    let provider = null;
    if (channel === 'claude-openrouter') provider = { ...providers.openrouter, id: 'openrouter', channel };
    if (channel === 'deepseek') provider = { ...providers.deepseek, id: 'deepseek', channel };
    if (channel === 'chatgpt') provider = { ...providers.openai, id: 'openai', channel };
    if (!provider) return null;
    return { ...provider, model: provider.models.includes(requestedModel) ? requestedModel : provider.models[0] };
  }

  function openAiContent(contentArray) {
    const blocks = [];
    for (const block of contentArray) {
      if (block.type === 'text' && block.text) blocks.push({ type: 'text', text: String(block.text) });
      if (block.type === 'image' && block.source?.data) blocks.push({ type: 'image_url', image_url: { url: `data:${block.source.media_type || 'image/png'};base64,${block.source.data}` } });
    }
    if (!blocks.length) return '';
    return blocks.length === 1 && blocks[0].type === 'text' ? blocks[0].text : blocks;
  }

  async function send(channel, room, contentArray, res, ctx = {}) {
    const provider = providerForChannel(channel, ctx.model);
    if (!provider?.apiKey) {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { message: '这个通道还没有在设置里配置 API Key' } }));
      return;
    }
    const prior = history().filter(item => String(item.room_id || 'home') === room.id && item.channel === channel && item.text).slice(-40);
    const messages = prior.map(item => ({ role: item.role === 'assistant' ? 'assistant' : 'user', content: String(item.text) }));
    const current = openAiContent(contentArray);
    const lastText = typeof current === 'string' ? current : current.filter(block => block.type === 'text').map(block => block.text).join('\n');
    if (!messages.length || messages[messages.length - 1].role !== 'user' || messages[messages.length - 1].content !== lastText) {
      messages.push({ role: 'user', content: current });
    } else if (Array.isArray(current)) {
      messages[messages.length - 1].content = current;
    }
    const endpoint = safeBaseUrl(provider.baseUrl, DEFAULTS[provider.id].baseUrl) + '/chat/completions';
    const headers = { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json' };
    if (provider.id === 'openrouter') {
      if (config.PUBLIC_URL) headers['HTTP-Referer'] = config.PUBLIC_URL;
      headers['X-Title'] = 'Perigee';
    }
    let upstream;
    const controller = new AbortController();
    active.set(room.id, controller);
    try {
      upstream = await fetch(endpoint, {
        method: 'POST', headers, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]),
        body: JSON.stringify({ model: provider.model, messages, stream: true }),
      });
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { message: `通道连接失败：${error.message}` } }));
      active.delete(room.id); return;
    }
    if (!upstream.ok || !upstream.body) {
      const detail = (await upstream.text().catch(() => '')).replace(provider.apiKey, '[redacted]').slice(0, 300);
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: { message: `上游返回 ${upstream.status}${detail ? `：${detail}` : ''}` } }));
      active.delete(room.id); return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    const id = `chatcmpl-${randomUUID().slice(0, 8)}`;
    const emit = fields => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: provider.model, choices: [{ index: 0, delta: fields, finish_reason: null }] })}\n\n`);
    emit({ role: 'assistant' });
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '', reply = '', thinking = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n'); buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data:') || line.trim() === 'data: [DONE]') continue;
          let delta;
          try { delta = JSON.parse(line.slice(5).trim())?.choices?.[0]?.delta || {}; } catch { continue; }
          const text = typeof delta.content === 'string' ? delta.content : '';
          const reason = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
          if (text) { reply += text; emit({ content: text }); }
          if (reason) { thinking += reason; emit({ reasoning_content: reason }); }
        }
      }
    } catch (error) {
      if (!reply) { reply = `（${provider.label} 通道中断：${error.message}）`; emit({ content: reply }); }
    }
    if (!reply) { reply = '（这个通道没有返回文字）'; emit({ content: reply }); }
    appendHistory({ role: 'assistant', text: reply, thinking, room_id: room.id, channel });
    pushBark(reply, room.id);
    res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: provider.model, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
    active.delete(room.id);
  }

  function stop(roomId) {
    const controller = active.get(roomId);
    if (!controller) return false;
    controller.abort(); active.delete(roomId); return true;
  }

  return { channels, publicProviders, saveProvider, providerForChannel, send, stop };
}

module.exports = { createChannelHub };
