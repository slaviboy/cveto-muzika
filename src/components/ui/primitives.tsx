import { Select as RSelect, Switch as RSwitch, ToggleGroup, Tooltip as RTooltip } from 'radix-ui'
import { Check, ChevronDown } from 'lucide-react'
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '../../utils/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ice text-void hover:bg-white active:bg-ice-dim font-[580]',
  secondary: 'bg-graphite-700/80 text-ink border border-line-strong hover:bg-graphite-600 hover:border-ice/25',
  ghost: 'text-ink-muted hover:text-ink hover:bg-white/[0.06]',
  danger: 'text-danger border border-danger/30 hover:bg-danger/10',
}
const SIZE: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs gap-1.5 rounded-[7px]',
  md: 'h-9 px-3.5 text-sm gap-2 rounded-[var(--radius-control)]',
  lg: 'h-12 px-5 text-[0.9375rem] gap-2.5 rounded-[12px]',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-colors duration-150 disabled:opacity-40',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({
  label,
  children,
  className,
  active,
  tooltip = true,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean; tooltip?: boolean }) {
  const button = (
    <button
      type="button"
      aria-label={label}
      className={cn(
        'inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-white/[0.07] hover:text-ink disabled:opacity-40 pointer-coarse:size-11',
        active && 'bg-white/[0.09] text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
  return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button
}

export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={350}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          className="z-[80] max-w-64 rounded-md border border-line-strong bg-graphite-800 px-2 py-1 text-xs text-ink shadow-xl pointer-coarse:hidden"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

export function Group({ title, children, aside, className }: { title?: ReactNode; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line pt-4 first:border-t-0 first:pt-0', className)}>
      {(title || aside) && (
        <div className="mb-3 flex min-h-6 items-center justify-between gap-3">
          {title && <h3 className="text-[0.8125rem] font-[560] text-ink">{title}</h3>}
          {aside}
        </div>
      )}
      <div className="flex flex-col gap-3.5">{children}</div>
    </section>
  )
}

export function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-ink-muted', className)}>{children}</p>
}

export function SwitchField({
  label,
  checked,
  onChange,
  description,
  testId,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  description?: string
  testId?: string
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-xs text-ink">{label}</span>
        {description && <span className="block text-2xs text-ink-faint">{description}</span>}
      </label>
      <RSwitch.Root
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        data-testid={testId}
        className="relative h-5 w-9 shrink-0 rounded-full border border-line-strong bg-graphite-600 transition-colors data-[state=checked]:border-ice/60 data-[state=checked]:bg-ice/85 pointer-coarse:h-6 pointer-coarse:w-11"
      >
        <RSwitch.Thumb className="block size-3.5 translate-x-[2px] rounded-full bg-ink shadow transition-transform duration-150 data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-void pointer-coarse:size-[18px] pointer-coarse:data-[state=checked]:translate-x-[21px]" />
      </RSwitch.Root>
    </div>
  )
}

export interface Option<T extends string> {
  value: T
  label: string
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string
  value: T
  options: readonly Option<T>[]
  onChange: (v: T) => void
  testId?: string
}) {
  const id = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <label htmlFor={id} className="text-xs text-ink-muted">
        {label}
      </label>
      <RSelect.Root value={value} onValueChange={(v) => onChange(v as T)}>
        <RSelect.Trigger
          id={id}
          data-testid={testId}
          className="inline-flex h-8 min-w-36 max-w-[60%] items-center justify-between gap-2 rounded-[var(--radius-control)] border border-line-strong bg-graphite-800 px-2.5 text-xs text-ink hover:border-ice/25 pointer-coarse:h-10"
        >
          <RSelect.Value />
          <RSelect.Icon>
            <ChevronDown size={14} className="text-ink-muted" />
          </RSelect.Icon>
        </RSelect.Trigger>
        <RSelect.Portal>
          <RSelect.Content position="popper" sideOffset={6} className="z-[90] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[10px] border border-line-strong bg-graphite-800 p-1 shadow-2xl">
            <RSelect.Viewport>
              {options.map((o) => (
                <RSelect.Item
                  key={o.value}
                  value={o.value}
                  className="relative flex h-8 cursor-pointer select-none items-center rounded-md pl-7 pr-3 text-xs text-ink outline-none data-[highlighted]:bg-white/[0.08] pointer-coarse:h-10"
                >
                  <RSelect.ItemIndicator className="absolute left-2">
                    <Check size={13} />
                  </RSelect.ItemIndicator>
                  <RSelect.ItemText>{o.label}</RSelect.ItemText>
                </RSelect.Item>
              ))}
            </RSelect.Viewport>
          </RSelect.Content>
        </RSelect.Portal>
      </RSelect.Root>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
  testIdPrefix,
}: {
  value: T
  options: readonly (Option<T> & { icon?: ReactNode })[]
  onChange: (v: T) => void
  label: string
  className?: string
  testIdPrefix?: string
}) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn('flex rounded-[9px] border border-line bg-graphite-900/80 p-0.5', className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          data-testid={testIdPrefix ? `${testIdPrefix}-${o.value}` : undefined}
          className="flex h-7 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[7px] px-2 text-xs text-ink-muted transition-colors hover:text-ink data-[state=on]:bg-graphite-600 data-[state=on]:text-ink pointer-coarse:h-9"
        >
          {o.icon}
          <span className="truncate">{o.label}</span>
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export function SegmentedField<T extends string>(props: {
  label: string
  value: T
  options: readonly (Option<T> & { icon?: ReactNode })[]
  onChange: (v: T) => void
  testIdPrefix?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-ink-muted">{props.label}</span>
      <Segmented {...props} />
    </div>
  )
}
