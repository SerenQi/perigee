type P = { d: string }
const S = ({ d }: P) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="w-[17px] h-[17px]">
    <path d={d} />
  </svg>
)
export const IconPin    = () => <S d="M14.5 3.5l6 6-3 1-4 4 1 4-1 1-4-4L4 21l4.5-5.5-4-4 1-1 4 1 4-4 1-3z" />
export const IconChat   = () => <S d="M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z" />
export const IconEbb    = () => <S d="M3 9c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0 4.3-1.6 5 0M3 14c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0 4.3-1.6 5 0M3 19c2.2-1.6 4.3-1.6 6.5 0s4.3 1.6 6.5 0 4.3-1.6 5 0" />
export const IconHeart  = () => <S d="M12 20s-7-4.5-7-9a4 4 0 018-1 4 4 0 018 1c0 4.5-7 9-7 9z" />
export const IconTerm   = () => <S d="M3 4h18v16H3zM7 9l3 3-3 3M12.5 15H17" />
export const IconMenu   = () => <S d="M4 7h16M4 12h16M4 17h16" />
export const IconChevron= () => <S d="M9 5l7 7-7 7" />
export const IconPhone  = () => <S d="M5 4h4l2 5-2.5 1.5a12 12 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 013 5a1 1 0 011-1z" />
export const IconNote   = () => <S d="M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
export const IconSearch = () => <S d="M11 4a7 7 0 107 7 7 7 0 00-7-7zM20 20l-4-4" />
export const IconBroom  = () => <S d="M4 20h16M6 20l6-9M18 20l-6-9M9 11h6M12 3v8" />
export const IconGauge  = () => <S d="M12 20a8 8 0 118-8M12 12l5-3" />
export const IconMic    = () => <S d="M9 4a3 3 0 016 0v6a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3" />
export const IconMoments = () => <S d="M4 7h3l1.5-2h7L17 7h3v13H4zM12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
export const IconMicSolid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3M8.5 21h7" />
  </svg>
)
export const IconPhotoSolid = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m5.5 17 4.5-4 3 2.5 2.5-2 3 3.5" />
  </svg>
)

const Sv = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]">
    {children}
  </svg>
)

export const ROOM_ICONS: Record<string, () => React.JSX.Element> = {
  Studio: () => <Sv><path d="M4 10.5L12 4l8 6.5" /><path d="M6.5 9.5V19h11V9.5" /><path d="M10 19v-5h4v5" /></Sv>,
  'Pin Board': () => <Sv><circle cx="12" cy="8.5" r="4.5" /><path d="M12 13v8M9.5 6.5a3 3 0 012-1.4" /></Sv>,
  Plans: () => <Sv><rect x="4.5" y="4" width="15" height="16" rx="2" /><path d="M8.5 12.5l2.5 2.5 4.5-5.5" /></Sv>,
  Gallery: () => <Sv><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.5" /><path d="m5.5 17 4.5-4 3 2.5 2.5-2 3 3.5" /></Sv>,
  Treasury: () => <Sv><path d="M9.5 7.5h5l3.2 5.8a6.2 6.2 0 01-11.4 0z" /><path d="M9.5 7.5C9 5.5 10.5 4 12 4s3 1.5 2.5 3.5" /></Sv>,
  Diary: () => <Sv><rect x="5" y="4" width="14" height="16" rx="1.5" /><path d="M8.5 4v16" /><path d="M14.2 9.6c-.8-.9-2.7-.4-2.7 1 0 1.2 2.7 2.9 2.7 2.9s2.7-1.7 2.7-2.9c0-1.4-1.9-1.9-2.7-1z" /></Sv>,
  Mood: () => <Sv><path d="M12 20s-7-4.5-7-9a4 4 0 018-1 4 4 0 018 1c0 4.5-7 9-7 9z" /></Sv>,
  Books: () => <Sv><path d="M12 6.5C10 5 7 5 4.5 6v13c2.5-1 5.5-1 7.5.5 2-1.5 5-1.5 7.5-.5V6c-2.5-1-5.5-1-7.5.5z" /><path d="M12 6.5V19" /></Sv>,
  Servers: () => <Sv><circle cx="5.5" cy="12" r="2.2" /><circle cx="18.5" cy="5.5" r="2.2" /><circle cx="18.5" cy="18.5" r="2.2" /><path d="M7.5 11l9-4.5M7.5 13l9 4.5" /></Sv>,
}
