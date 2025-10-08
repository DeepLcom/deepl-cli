# DeepL CLI - TUI Implementation Plan

**Version**: 1.0
**Date**: October 8, 2025
**Status**: Planning Phase
**Target**: Phase 3 (v0.3.0)

---

## 🎯 Executive Summary

Build an interactive Terminal User Interface (TUI) for DeepL CLI using **Ink** (React for terminals). The TUI will provide a visual, mouse-enabled interface for translation workflows, making the CLI accessible to users who prefer GUI-like experiences while maintaining terminal efficiency.

### Key Goals
1. **Accessibility** - Make translation workflows visual and intuitive
2. **Efficiency** - Faster than CLI for complex workflows
3. **Real-time feedback** - Live translation preview as you type
4. **Professional** - Beautiful, polished terminal UI with animations

---

## 📐 Architecture Design

### Technology Stack

```typescript
{
  "tui": {
    "ink": "^4.4.1",                    // React for terminal
    "ink-text-input": "^5.0.1",        // Text input component
    "ink-select-input": "^5.0.0",      // Selection menus
    "ink-spinner": "^5.0.0",           // Loading spinners
    "ink-big-text": "^2.0.0",          // Large ASCII text
    "ink-link": "^3.0.0",              // Clickable links
    "ink-table": "^3.1.0",             // Data tables
    "ink-gradient": "^3.0.0",          // Gradient text
    "ink-divider": "^3.0.0"            // Visual dividers
  },
  "testing": {
    "@testing-library/react": "^14.1.0",     // React Testing Library
    "@types/react": "^18.2.45",              // React types
    "ink-testing-library": "^3.0.0"          // Ink-specific testing
  },
  "state": {
    "zustand": "^4.4.7"                // Lightweight state management
  }
}
```

### Component Structure

```
src/tui/
├── index.tsx                   # TUI entry point
├── App.tsx                     # Root application component
├── hooks/                      # Custom React hooks
│   ├── useTranslation.ts      # Translation state & API
│   ├── useGlossary.ts         # Glossary management
│   ├── useHistory.ts          # Translation history
│   └── useKeyboard.ts         # Keyboard shortcuts
├── components/                 # Reusable components
│   ├── Header.tsx             # App header with branding
│   ├── Footer.tsx             # Shortcuts help bar
│   ├── StatusBar.tsx          # Status and stats
│   ├── TextEditor.tsx         # Multi-line text input
│   ├── LanguageSelector.tsx   # Language picker
│   ├── LoadingSpinner.tsx     # Loading indicator
│   └── ErrorBox.tsx           # Error display
├── screens/                    # Main screens (routes)
│   ├── HomeScreen.tsx         # Main dashboard
│   ├── TranslateScreen.tsx    # Translation interface
│   ├── HistoryScreen.tsx      # Translation history
│   ├── GlossaryScreen.tsx     # Glossary manager
│   ├── SettingsScreen.tsx     # Settings panel
│   └── HelpScreen.tsx         # Help & documentation
├── layouts/                    # Layout components
│   ├── MainLayout.tsx         # Standard screen layout
│   └── SplitPane.tsx          # Split-pane editor
└── store/                      # State management
    ├── appStore.ts            # Global app state
    ├── translationStore.ts    # Translation state
    └── uiStore.ts             # UI state (themes, etc.)
```

---

## 🖼️ Screen Designs

### 1. Home Screen (Dashboard)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🌍 DeepL CLI                                      v0.3.0    [? Help] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│   ╔══════════════════════════════════════════════════════════════╗  │
│   ║                                                              ║  │
│   ║    █▀▄ █▀▀ █▀▀ █▀█ █   █   █▀▀ █   █                       ║  │
│   ║    █ █ █▀▀ █▀▀ █▀▀ █   █▄▄ █   █   █                       ║  │
│   ║                                                              ║  │
│   ║         Professional Translation Terminal                   ║  │
│   ║                                                              ║  │
│   ╚══════════════════════════════════════════════════════════════╝  │
│                                                                       │
│   What would you like to do?                                         │
│                                                                       │
│   ▶  Translate Text            Translate text or files               │
│      Translation History       Browse past translations              │
│      Manage Glossaries        Create and edit glossaries            │
│      Settings                 Configure preferences                 │
│      Help & Shortcuts         View keyboard shortcuts               │
│      Exit                     Return to shell                       │
│                                                                       │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │ 📊 Today's Usage: 1,250 / 500,000 chars (0.25%)           │   │
│   │ ⚡ Cache: 234 entries • 45 MB                              │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ ↑↓ Navigate • Enter Select • ? Help • Esc/q Quit                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2. Translation Screen (Split-Pane Editor)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🌍 DeepL CLI • Translate                          [Esc] Back to Menu │
├─────────────────────────────────────────────────────────────────────┤
│ From: [EN] English (detected)      To: [ES] Spanish    [⚙️ Options] │
├───────────────────────────────┬─────────────────────────────────────┤
│ Source Text                   │ Translation                         │
│                               │                                     │
│ Hello, world!                 │ ¡Hola, mundo!                      │
│ This is a test of the DeepL   │ Esta es una prueba de la           │
│ CLI translation interface.    │ interfaz de traducción de DeepL    │
│ It supports real-time         │ CLI. Admite traducción en          │
│ translation as you type.      │ tiempo real mientras escribes.     │
│                               │                                     │
│ Features:                     │ Características:                   │
│ - Context-aware translation   │ - Traducción sensible al contexto  │
│ - Code preservation           │ - Preservación de código           │
│ - Glossary support            │ - Soporte de glosario              │
│                               │                                     │
│ █                             │                                     │
│                               │                                     │
│                               │ ✅ Translated • 152 chars          │
│                               │ ⚡ Cached • 0.2s                   │
│                               │                                     │
├───────────────────────────────┴─────────────────────────────────────┤
│ 💡 Context: General conversation                                     │
│ 📖 Glossary: None                                                    │
│ 🎯 Formality: Default                                               │
├─────────────────────────────────────────────────────────────────────┤
│ Ctrl+T Translate • Ctrl+S Save • Ctrl+C Copy • Tab Switch Pane      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3. History Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🌍 DeepL CLI • History                            [Esc] Back to Menu │
├─────────────────────────────────────────────────────────────────────┤
│ Search: [___________________________]   Filter: [All] ▼  Sort: [↓]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ▶ Today                                                              │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ 14:32 • EN → ES • 152 chars                                   │ │
│   │ "Hello, world! This is a test..." → "¡Hola, mundo! Esta..."  │ │
│   └───────────────────────────────────────────────────────────────┘ │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ 12:15 • EN → FR • 423 chars                                   │ │
│   │ "Welcome to our platform..." → "Bienvenue sur notre..."       │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   Yesterday                                                          │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ 16:42 • DE → EN • 891 chars                                   │ │
│   │ "Guten Tag, wie geht es Ihnen..." → "Good day, how are..."   │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   This Week                                                          │
│   [12 more translations...]                                          │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Enter View • Ctrl+C Copy • Del Delete • / Search                    │
└─────────────────────────────────────────────────────────────────────┘
```

### 4. Glossary Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🌍 DeepL CLI • Glossaries                         [Esc] Back to Menu │
├─────────────────────────────────────────────────────────────────────┤
│ [+ New Glossary]                                                     │
│                                                                       │
│ ▶ Tech Terms (EN → ES)                                              │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ Source          │ Target                                       │ │
│   ├─────────────────┼─────────────────────────────────────────────┤ │
│   │ API             │ API                                          │ │
│   │ database        │ base de datos                                │ │
│   │ authentication  │ autenticación                                │ │
│   │ deployment      │ despliegue                                   │ │
│   │ [+ Add entry]   │                                              │ │
│   └───────────────────────────────────────────────────────────────┘ │
│   12 entries • Last modified: 2 hours ago                            │
│   [Edit] [Export] [Delete]                                           │
│                                                                       │
│   Marketing (EN → FR)                                                │
│   8 entries • Last modified: 3 days ago                              │
│                                                                       │
│   Legal (EN → DE)                                                    │
│   45 entries • Last modified: 1 week ago                             │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Enter Select • E Edit • D Delete • I Import • X Export              │
└─────────────────────────────────────────────────────────────────────┘
```

### 5. Settings Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🌍 DeepL CLI • Settings                           [Esc] Back to Menu │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│ ▶ General                                                            │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ Default Source Language:  [Auto-detect] ▼                     │ │
│   │ Default Target Language:  [ES] Spanish ▼                      │ │
│   │ Formality:                [Default] ▼                         │ │
│   │ Auto-translate delay:     [500ms] ▼                           │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   Cache                                                              │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ Enable cache:             [✓] Enabled                         │ │
│   │ Max cache size:           [100 MB]                            │ │
│   │ Cache TTL:                [30 days]                           │ │
│   │                           [Clear Cache Now]                   │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
│   Appearance                                                         │
│   ┌───────────────────────────────────────────────────────────────┐ │
│   │ Theme:                    [Dark] ▼                            │ │
│   │ Color scheme:             [DeepL Blue] ▼                      │ │
│   │ Show animations:          [✓] Enabled                         │ │
│   └───────────────────────────────────────────────────────────────┘ │
│                                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Enter Edit • Ctrl+S Save • Ctrl+R Reset to Defaults                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🎮 User Interactions & Keyboard Shortcuts

### Global Shortcuts
- `Esc` or `q` - Go back / Exit
- `?` or `h` - Show help overlay
- `Ctrl+C` - Copy (context-dependent)
- `Ctrl+Q` - Quit application
- `/` - Quick search (where applicable)
- `Tab` - Cycle through focusable elements
- `Shift+Tab` - Cycle backwards

### Navigation
- `↑↓` or `j/k` - Navigate lists
- `Enter` - Select / Confirm
- `Space` - Toggle selection (multi-select)
- `Home` / `End` - Jump to top/bottom
- `PgUp` / `PgDn` - Page up/down

### Translation Screen
- `Ctrl+T` - Trigger translation
- `Ctrl+S` - Save translation
- `Ctrl+L` - Swap languages
- `Ctrl+O` - Open translation options
- `Ctrl+G` - Select glossary
- `Tab` - Switch between source/target panes
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo

### Advanced Features
- `Ctrl+H` - View history
- `Ctrl+B` - Batch translate mode
- `Ctrl+,` - Open settings
- `F1-F12` - Quick access to features (customizable)

---

## 🧪 Testing Strategy

### Unit Tests (Component Testing)

```typescript
// Example: TextEditor component test
import { render } from 'ink-testing-library';
import React from 'react';
import TextEditor from '../components/TextEditor';

describe('TextEditor', () => {
  it('should render text input', () => {
    const { lastFrame } = render(<TextEditor value="" onChange={jest.fn()} />);
    expect(lastFrame()).toContain('│');
  });

  it('should call onChange when text changes', () => {
    const onChange = jest.fn();
    const { stdin } = render(<TextEditor value="" onChange={onChange} />);

    stdin.write('Hello');
    expect(onChange).toHaveBeenCalled();
  });

  it('should support multi-line text', () => {
    const { lastFrame } = render(
      <TextEditor value="Line 1\nLine 2" onChange={jest.fn()} />
    );
    expect(lastFrame()).toContain('Line 1');
    expect(lastFrame()).toContain('Line 2');
  });
});
```

### Integration Tests (Screen Testing)

```typescript
// Example: TranslateScreen integration test
import { render } from 'ink-testing-library';
import React from 'react';
import TranslateScreen from '../screens/TranslateScreen';
import { TranslationService } from '../../services/translation';

jest.mock('../../services/translation');

describe('TranslateScreen', () => {
  it('should display translation result', async () => {
    const mockTranslate = jest.fn().mockResolvedValue({
      text: 'Hola',
      detectedSourceLang: 'en',
    });

    (TranslationService.prototype.translate as jest.Mock) = mockTranslate;

    const { lastFrame, stdin } = render(<TranslateScreen />);

    // Type source text
    stdin.write('Hello');

    // Wait for translation
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(lastFrame()).toContain('Hola');
    expect(mockTranslate).toHaveBeenCalledWith('Hello', expect.any(Object));
  });

  it('should handle translation errors gracefully', async () => {
    const mockTranslate = jest.fn().mockRejectedValue(
      new Error('API error')
    );

    (TranslationService.prototype.translate as jest.Mock) = mockTranslate;

    const { lastFrame, stdin } = render(<TranslateScreen />);

    stdin.write('Hello');
    await new Promise(resolve => setTimeout(resolve, 600));

    expect(lastFrame()).toContain('API error');
  });
});
```

### E2E Tests (User Flow Testing)

```typescript
// Example: Complete translation workflow
describe('Translation Workflow E2E', () => {
  it('should complete full translation flow', async () => {
    const { lastFrame, stdin } = render(<App />);

    // Start at home screen
    expect(lastFrame()).toContain('What would you like to do?');

    // Select "Translate Text"
    stdin.write('\r'); // Enter

    // Should be on translate screen
    expect(lastFrame()).toContain('Source Text');
    expect(lastFrame()).toContain('Translation');

    // Type source text
    stdin.write('Hello, world!');

    // Wait for auto-translation
    await new Promise(resolve => setTimeout(resolve, 600));

    // Should see translated text
    expect(lastFrame()).toContain('Hola, mundo!');

    // Save translation
    stdin.write('\u0014'); // Ctrl+T

    // Should show success
    expect(lastFrame()).toContain('Saved');
  });
});
```

---

## 📋 Implementation Phases

### Phase 3.1: Foundation (Week 1-2)
**Goal**: Set up TUI infrastructure and basic navigation

- [x] Research Ink framework *(in progress)*
- [ ] Install Ink dependencies and testing tools
- [ ] Create TUI project structure (components, screens, hooks)
- [ ] Build App.tsx with routing logic
- [ ] Create MainLayout component
- [ ] Build HomeScreen with menu navigation
- [ ] Add basic keyboard shortcuts (up/down, enter, esc)
- [ ] Write tests for basic navigation
- [ ] Add color themes and styling

**Deliverable**: Working home screen with menu navigation

### Phase 3.2: Translation Interface (Week 3-4)
**Goal**: Build the core translation screen

- [ ] Create TranslateScreen component
- [ ] Build SplitPane layout component
- [ ] Create TextEditor component (multi-line input)
- [ ] Add LanguageSelector dropdown
- [ ] Integrate TranslationService
- [ ] Implement real-time translation with debouncing
- [ ] Add translation options panel (formality, context, etc.)
- [ ] Show translation stats (chars, time, cached)
- [ ] Add copy/save functionality
- [ ] Write comprehensive tests for translation flow

**Deliverable**: Fully functional split-pane translation interface

### Phase 3.3: History & Glossary (Week 5)
**Goal**: Add supporting screens

- [ ] Create HistoryScreen component
- [ ] Build translation history browser
- [ ] Add search and filter functionality
- [ ] Create GlossaryScreen component
- [ ] Build glossary CRUD interface
- [ ] Add glossary import/export
- [ ] Integrate glossaries into translation
- [ ] Write tests for history and glossary screens

**Deliverable**: Working history and glossary management

### Phase 3.4: Settings & Polish (Week 6)
**Goal**: Complete the TUI experience

- [ ] Create SettingsScreen component
- [ ] Build settings editor with live preview
- [ ] Add theme switching
- [ ] Create HelpScreen with keyboard shortcuts
- [ ] Add loading animations and spinners
- [ ] Add error handling and error screens
- [ ] Implement status bar with real-time stats
- [ ] Add usage dashboard
- [ ] Polish animations and transitions
- [ ] Write E2E tests for complete workflows

**Deliverable**: Production-ready TUI

### Phase 3.5: Documentation & Release (Week 7)
**Goal**: Document and release v0.3.0

- [ ] Update README with TUI documentation
- [ ] Add TUI examples and GIFs/videos
- [ ] Update CHANGELOG with TUI features
- [ ] Create TUI tutorial
- [ ] Update DESIGN.md with TUI architecture
- [ ] Tag v0.3.0 release
- [ ] Create release notes

**Deliverable**: v0.3.0 release with complete TUI

---

## 🎨 Design Principles

### 1. **Keyboard-First**
- Every action must be accessible via keyboard
- Shortcuts should be intuitive and follow conventions
- Display shortcuts prominently in footer

### 2. **Real-Time Feedback**
- Show loading states immediately
- Display progress for long operations
- Provide visual confirmation for actions

### 3. **Graceful Degradation**
- Handle errors without crashing
- Show helpful error messages
- Provide recovery options

### 4. **Performance**
- Debounce auto-translation (500ms default)
- Cache translation results
- Lazy-load screens and components
- Optimize re-renders with React.memo

### 5. **Accessibility**
- High contrast colors
- Clear visual hierarchy
- Screen reader friendly (where possible)
- Keyboard navigation without mouse

---

## 🔌 Integration with Existing Services

The TUI will use existing services without modification:

```typescript
// Services to integrate
import { TranslationService } from '../services/translation';
import { WriteService } from '../services/write';
import { GlossaryService } from '../services/glossary';
import { CacheService } from '../services/cache';
import { FileTranslationService } from '../services/file-translation';
import { ConfigService } from '../storage/config';

// Example: TranslateScreen using TranslationService
const TranslateScreen = () => {
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const translationService = useMemo(
    () => new TranslationService(deeplClient, configService, cacheService),
    []
  );

  const handleTranslate = useCallback(async () => {
    if (!sourceText.trim()) return;

    setIsLoading(true);
    try {
      const result = await translationService.translate(sourceText, {
        targetLang: 'es',
        preserveCode: true,
      });
      setTranslatedText(result.text);
    } catch (error) {
      // Handle error
    } finally {
      setIsLoading(false);
    }
  }, [sourceText, translationService]);

  // Debounced auto-translation
  useEffect(() => {
    const timer = setTimeout(handleTranslate, 500);
    return () => clearTimeout(timer);
  }, [sourceText, handleTranslate]);

  return (
    <SplitPane
      left={<TextEditor value={sourceText} onChange={setSourceText} />}
      right={
        isLoading ? (
          <LoadingSpinner />
        ) : (
          <Text>{translatedText}</Text>
        )
      }
    />
  );
};
```

---

## 📦 Dependencies to Add

```bash
# TUI framework
npm install ink@^4.4.1
npm install ink-text-input@^5.0.1
npm install ink-select-input@^5.0.0
npm install ink-spinner@^5.0.0
npm install ink-big-text@^2.0.0
npm install ink-link@^3.0.0
npm install ink-table@^3.1.0
npm install ink-gradient@^3.0.0
npm install ink-divider@^3.0.0

# React (peer dependencies)
npm install react@^18.2.0
npm install react-devtools@^4.28.0

# State management
npm install zustand@^4.4.7

# Testing
npm install --save-dev @testing-library/react@^14.1.0
npm install --save-dev @types/react@^18.2.45
npm install --save-dev ink-testing-library@^3.0.0

# Build
npm install --save-dev @types/react@^18.2.45
```

---

## ✅ Success Criteria

### Must Have (v0.3.0)
- ✅ Home screen with menu navigation
- ✅ Translation screen with split-pane editor
- ✅ Real-time translation with debouncing
- ✅ Language selection dropdowns
- ✅ Translation history browser
- ✅ Glossary management interface
- ✅ Settings panel
- ✅ Help screen with shortcuts
- ✅ Keyboard shortcuts
- ✅ Error handling
- ✅ 80%+ test coverage for TUI components

### Nice to Have (v0.3.1+)
- 🎯 Mouse support (click to focus)
- 🎯 Drag-and-drop file translation
- 🎯 Batch translation manager
- 🎯 Translation diff viewer
- 🎯 Dark/light theme toggle
- 🎯 Usage analytics dashboard
- 🎯 Translation quality scoring
- 🎯 Glossary suggestions while typing

### Future Enhancements (v0.4.0+)
- 🔮 Translation memory viewer
- 🔮 Team collaboration features
- 🔮 Review workflows
- 🔮 Plugin system for custom screens
- 🔮 Export to various formats (PDF, DOCX)

---

## 🚧 Known Challenges & Solutions

### Challenge 1: Multi-line Text Input
**Problem**: Ink's built-in TextInput is single-line only
**Solution**: Build custom TextEditor component using `ink-text-input` with custom rendering logic or use `ink-text-area` if available

### Challenge 2: Real-time Translation Performance
**Problem**: Translating on every keystroke can be slow and expensive
**Solution**: Implement debouncing (500ms) + show "Translating..." indicator + use cache aggressively

### Challenge 3: Complex Layout Rendering
**Problem**: Ink's layout system is flexbox-based, can be tricky for complex UIs
**Solution**: Use Box components with careful width/height management, test on multiple terminal sizes

### Challenge 4: Testing TUI Components
**Problem**: Ink tests render to strings, making assertions verbose
**Solution**: Use `ink-testing-library` helpers + snapshot testing + integration tests

### Challenge 5: Terminal Compatibility
**Problem**: Not all terminals support all features (colors, mouse, etc.)
**Solution**: Detect terminal capabilities + graceful degradation + test on major terminals (iTerm, Windows Terminal, etc.)

---

## 📊 Metrics & KPIs

### Development Metrics
- Lines of code: ~2,000 (estimated)
- Components: ~25
- Screens: 6
- Test coverage: 80%+
- Development time: 7 weeks

### Performance Metrics
- App startup: <200ms
- Screen transition: <50ms
- Translation trigger: <500ms (debounced)
- Memory usage: <50MB

### User Experience Metrics
- Keystrokes to translate: 3 (navigate + type + auto-translate)
- Time to first translation: <30 seconds (for new users)
- Error rate: <1%

---

## 🎉 Next Steps

1. **[IN PROGRESS]** Research Ink framework and best practices
2. Set up dependencies and project structure
3. Build HomeScreen (week 1)
4. Build TranslateScreen (week 2-3)
5. Build HistoryScreen and GlossaryScreen (week 4)
6. Build SettingsScreen and polish (week 5)
7. Documentation and release v0.3.0 (week 6)

---

**Last Updated**: October 8, 2025
**Status**: Planning Complete - Ready to implement!
**Estimated Completion**: End of November 2025
