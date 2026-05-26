// 5개 테마 정의. CSS 변수 키와 의미는 모든 테마에서 동일하므로
// 컴포넌트는 var(--theme-*) 만 참조하면 된다.
//
// 색 토큰 설계 원칙:
//   - bg: 페이지 배경
//   - panel: 카드/패널 배경 (반투명 가능)
//   - elevated: 강조 패널
//   - border: 1px 보더
//   - text: 본문 텍스트
//   - textMuted: 보조 텍스트
//   - accent: 강조색 (학습 진행, 버튼)
//   - accentSoft: 강조색 옅은 버전
//   - codeBg: 두문자/코드 배경
//   - success/warning/danger: 상태 색

export const THEMES = {
  dark: {
    label: '다크',
    description: '기본 다크 테마',
    vars: {
      '--theme-bg': '#0a0f1e',
      '--theme-panel': 'rgba(15,23,42,0.8)',
      '--theme-elevated': '#0f172a',
      '--theme-border': '#1e293b',
      '--theme-borderStrong': '#334155',
      '--theme-text': '#e2e8f0',
      '--theme-textMuted': '#94a3b8',
      '--theme-textDim': '#64748b',
      '--theme-accent': '#818cf8',
      '--theme-accentStrong': '#6366f1',
      '--theme-accentSoft': 'rgba(99,102,241,0.15)',
      '--theme-codeBg': '#0a0f1e',
      '--theme-success': '#22c55e',
      '--theme-warning': '#f59e0b',
      '--theme-danger': '#ef4444',
      '--theme-headerBg': 'rgba(10,15,30,0.95)',
    },
  },

  light: {
    label: '라이트',
    description: '눈에 편안한 밝은 테마',
    vars: {
      '--theme-bg': '#f8fafc',
      '--theme-panel': '#ffffff',
      '--theme-elevated': '#ffffff',
      '--theme-border': '#e2e8f0',
      '--theme-borderStrong': '#cbd5e1',
      '--theme-text': '#0f172a',
      '--theme-textMuted': '#475569',
      '--theme-textDim': '#94a3b8',
      '--theme-accent': '#4f46e5',
      '--theme-accentStrong': '#4338ca',
      '--theme-accentSoft': 'rgba(79,70,229,0.1)',
      '--theme-codeBg': '#f1f5f9',
      '--theme-success': '#16a34a',
      '--theme-warning': '#d97706',
      '--theme-danger': '#dc2626',
      '--theme-headerBg': 'rgba(248,250,252,0.95)',
    },
  },

  sepia: {
    label: '세피아',
    description: '종이 같은 따뜻한 색감, 장시간 학습용',
    vars: {
      '--theme-bg': '#f5efe0',
      '--theme-panel': '#fbf6e8',
      '--theme-elevated': '#fefaee',
      '--theme-border': '#dccfae',
      '--theme-borderStrong': '#b8a880',
      '--theme-text': '#3a2f1c',
      '--theme-textMuted': '#6b5a3e',
      '--theme-textDim': '#8a7858',
      '--theme-accent': '#8b5a2b',
      '--theme-accentStrong': '#6d4520',
      '--theme-accentSoft': 'rgba(139,90,43,0.12)',
      '--theme-codeBg': '#ede4cb',
      '--theme-success': '#5a7a2a',
      '--theme-warning': '#a86d10',
      '--theme-danger': '#9a3416',
      '--theme-headerBg': 'rgba(245,239,224,0.95)',
    },
  },

  oled: {
    label: 'OLED 절전',
    description: 'AMOLED 화면에서 배터리를 아끼는 순흑 배경',
    vars: {
      '--theme-bg': '#000000',
      '--theme-panel': '#0a0a0a',
      '--theme-elevated': '#111111',
      '--theme-border': '#1a1a1a',
      '--theme-borderStrong': '#2a2a2a',
      '--theme-text': '#e8e8e8',
      '--theme-textMuted': '#999999',
      '--theme-textDim': '#666666',
      '--theme-accent': '#a5b4fc',
      '--theme-accentStrong': '#818cf8',
      '--theme-accentSoft': 'rgba(165,180,252,0.12)',
      '--theme-codeBg': '#000000',
      '--theme-success': '#4ade80',
      '--theme-warning': '#fbbf24',
      '--theme-danger': '#f87171',
      '--theme-headerBg': 'rgba(0,0,0,0.95)',
    },
  },

  highContrast: {
    label: '고대비',
    description: '접근성 우선, 검정/노랑/흰색의 강한 대비',
    vars: {
      '--theme-bg': '#000000',
      '--theme-panel': '#000000',
      '--theme-elevated': '#0a0a0a',
      '--theme-border': '#ffffff',
      '--theme-borderStrong': '#ffff00',
      '--theme-text': '#ffffff',
      '--theme-textMuted': '#ffff00',
      '--theme-textDim': '#cccccc',
      '--theme-accent': '#ffff00',
      '--theme-accentStrong': '#ffd700',
      '--theme-accentSoft': 'rgba(255,255,0,0.2)',
      '--theme-codeBg': '#000000',
      '--theme-success': '#00ff00',
      '--theme-warning': '#ffaa00',
      '--theme-danger': '#ff4444',
      '--theme-headerBg': '#000000',
    },
  },
}

export const DEFAULT_THEME = 'dark'
export const THEME_KEYS = Object.keys(THEMES)
