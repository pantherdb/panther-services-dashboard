import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Chip,
  Code,
  Divider,
  Drawer,
  Menu,
  Modal,
  MultiSelect,
  Pagination,
  Paper,
  Popover,
  ScrollArea,
  SegmentedControl,
  Select,
  Switch,
  Tabs,
  TextInput,
  Tooltip,
  createTheme,
} from '@mantine/core'

/**
 * Mantine theme for the app.
 *
 * Mantine owns interactive controls; the token layer in `src/index.css` owns colour. So this file
 * has no colour value: `primaryColor` stays Mantine's `blue`, and `index.css` re-points Mantine's
 * semantic variables (`--mantine-primary-color-filled`, `--mantine-color-body`, its dark scale) at
 * our accent and surfaces.
 *
 * Everything here is size, radius and type: controls default small and rounded once here, rather
 * than at every call site.
 */
export const mantineTheme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  focusRing: 'auto',
  cursorType: 'pointer',
  fontFamily: '"Inter Variable", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontFamilyMonospace:
    '"JetBrains Mono Variable", ui-monospace, "Cascadia Mono", Consolas, "SF Mono", Menlo, monospace',
  // In step with the Tailwind type scale in index.css, so a control and the text beside it agree.
  fontSizes: {
    xs: '0.75rem',
    sm: '0.8125rem',
    md: '0.875rem',
    lg: '1rem',
    xl: '1.25rem',
  },
  lineHeights: { xs: '1.4', sm: '1.45', md: '1.5', lg: '1.5', xl: '1.4' },
  spacing: { xs: '0.375rem', sm: '0.5rem', md: '0.75rem', lg: '1rem', xl: '1.5rem' },
  radius: { xs: '4px', sm: '6px', md: '8px', lg: '10px', xl: '12px' },
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '1.375rem', lineHeight: '1.3' },
      h2: { fontSize: '1rem', lineHeight: '1.35' },
      h3: { fontSize: '0.875rem', lineHeight: '1.4' },
      h4: { fontSize: '0.8125rem', lineHeight: '1.4' },
    },
  },
  components: {
    // A filled control's text takes the accent's own ink: white is unreadable on the dark
    // scheme's light violet.
    Button: Button.extend({
      defaultProps: { size: 'xs', variant: 'default', radius: 'md' },
      styles: { root: { fontWeight: 500 } },
      vars: (_theme, props) => ({
        root: props.variant === 'filled' ? { '--button-color': 'var(--sd-on-accent)' } : {},
      }),
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { variant: 'subtle', color: 'gray', size: 'md', radius: 'md' },
    }),
    Anchor: Anchor.extend({ defaultProps: { underline: 'hover', size: 'sm' } }),
    Badge: Badge.extend({ defaultProps: { radius: 'sm', variant: 'light' } }),
    TextInput: TextInput.extend({ defaultProps: { size: 'xs', radius: 'md' } }),
    Select: Select.extend({
      defaultProps: { size: 'xs', allowDeselect: false, comboboxProps: { withinPortal: true } },
    }),
    MultiSelect: MultiSelect.extend({
      defaultProps: { size: 'xs', comboboxProps: { withinPortal: true } },
    }),
    Checkbox: Checkbox.extend({ defaultProps: { size: 'xs' } }),
    Chip: Chip.extend({
      defaultProps: { size: 'xs', radius: 'md' },
      vars: () => ({ root: { '--chip-color': 'var(--sd-on-accent)' } }),
    }),
    Switch: Switch.extend({ defaultProps: { size: 'sm' } }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { size: 'xs', radius: 'md', withItemsBorders: false },
      classNames: { root: 'sd-segmented', indicator: 'sd-segmented-indicator' },
    }),
    Pagination: Pagination.extend({ defaultProps: { size: 'sm', radius: 'md' } }),
    Tabs: Tabs.extend({ defaultProps: { variant: 'default', keepMounted: false } }),
    // Focus and touch as well as hover, so a tooltip is reachable from the keyboard and on a phone.
    Tooltip: Tooltip.extend({
      defaultProps: {
        withArrow: true,
        openDelay: 200,
        fz: 'xs',
        maw: 320,
        multiline: true,
        radius: 'md',
        events: { hover: true, focus: true, touch: true },
      },
    }),
    Popover: Popover.extend({
      defaultProps: { withinPortal: true, shadow: 'md', radius: 'md', withArrow: true },
    }),
    Menu: Menu.extend({ defaultProps: { withinPortal: true, shadow: 'md', radius: 'md' } }),
    Modal: Modal.extend({ defaultProps: { radius: 'lg', centered: true, size: 'lg' } }),
    Drawer: Drawer.extend({ defaultProps: { size: 280 } }),
    // Cards are `Panel`; a stray <Paper> stays flat rather than becoming a second card style.
    Paper: Paper.extend({
      defaultProps: { shadow: 'none', radius: 'lg', withBorder: false, p: 0 },
    }),
    Divider: Divider.extend({ defaultProps: { size: 1 } }),
    Code: Code.extend({ defaultProps: { fz: 'xs' } }),
    ScrollArea: ScrollArea.extend({
      defaultProps: { type: 'auto', scrollbarSize: 8, offsetScrollbars: false },
    }),
  },
})
