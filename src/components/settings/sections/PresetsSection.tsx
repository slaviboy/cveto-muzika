import { Check, Download, FileUp, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useT } from '../../../i18n/useT'
import { BUILTIN_PRESETS } from '../../../presets/builtinPresets'
import { mergePresetIntoSettings, parsePresetText, serializePreset, serializeUserPreset } from '../../../presets/presetIO'
import { createDefaultSettings } from '../../../state/defaults'
import { useAppStore } from '../../../state/useAppStore'
import { cn } from '../../../utils/cn'
import { downloadText, slugify } from '../../../utils/misc'
import { ModeGlyph } from '../../visualizer/glyphs'
import { Button, Group, Hint, IconButton } from '../../ui/primitives'

function presetGradient(colors: string[]) {
  if (!colors.length) return 'transparent'
  if (colors.length === 1) return colors[0]
  return `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${((i / (colors.length - 1)) * 100).toFixed(1)}%`).join(', ')})`
}

function BuiltinGrid() {
  const t = useT()
  const activeId = useAppStore((s) => s.activePresetId)
  const apply = useAppStore((s) => s.applyBuiltinPreset)
  const swatches = useMemo(
    () =>
      Object.fromEntries(
        BUILTIN_PRESETS.map((p) => {
          const { settings } = mergePresetIntoSettings(createDefaultSettings(), p.build())
          return [p.id, settings.channels.map((c) => c.color)]
        }),
      ),
    [],
  )
  return (
    <div className="grid grid-cols-2 gap-2">
      {BUILTIN_PRESETS.map((p) => (
        <button
          key={p.id}
          type="button"
          data-testid={`builtin-${p.id}`}
          onClick={() => apply(p.id)}
          aria-pressed={activeId === p.id}
          className={cn(
            'flex flex-col gap-2 rounded-[12px] border p-2.5 text-left transition-colors',
            activeId === p.id ? 'border-ice/45 bg-white/[0.07]' : 'border-line hover:border-line-strong hover:bg-white/[0.03]',
          )}
        >
          <span className="h-1.5 w-full rounded-full" style={{ background: presetGradient(swatches[p.id] ?? []) }} aria-hidden="true" />
          <span className="flex items-center gap-1.5">
            <span className="text-ink-muted">
              <ModeGlyph mode={p.mode} size={14} />
            </span>
            <span className="truncate text-xs font-[560] text-ink">{t(p.name)}</span>
          </span>
          <span className="line-clamp-2 text-2xs leading-snug text-ink-muted">{t(p.description)}</span>
        </button>
      ))}
    </div>
  )
}

function UserPresetRow({ id }: { id: string }) {
  const t = useT()
  const preset = useAppStore((s) => s.userPresets.find((p) => p.id === id))
  const activeId = useAppStore((s) => s.activePresetId)
  const dirty = useAppStore((s) => s.presetDirty)
  const apply = useAppStore((s) => s.applyUserPreset)
  const rename = useAppStore((s) => s.renameUserPreset)
  const overwrite = useAppStore((s) => s.overwriteUserPreset)
  const remove = useAppStore((s) => s.deleteUserPreset)
  const toast = useAppStore((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(preset?.name ?? '')
  const [confirmDelete, setConfirmDelete] = useState(false)
  if (!preset) return null
  const active = activeId === id

  return (
    <li className={cn('flex items-center gap-1 rounded-[10px] border px-2 py-1.5', active ? 'border-ice/35 bg-white/[0.05]' : 'border-line')} data-testid="user-preset">
      <span className="h-6 w-1.5 shrink-0 rounded-full" style={{ background: presetGradient(preset.settings.channels.map((c) => c.color)) }} aria-hidden="true" />
      {editing ? (
        <input
          autoFocus
          aria-label={t('Preset name')}
          className="h-8 min-w-0 flex-1 rounded-md border border-ice/40 bg-graphite-900 px-2 text-xs text-ink outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            rename(id, name)
            setEditing(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') {
              setName(preset.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button type="button" className="min-w-0 flex-1 truncate rounded-md px-2 py-1 text-left text-xs text-ink hover:bg-white/[0.05]" onClick={() => apply(id)} title={t('Load this preset')}>
          {preset.name}
          {active && dirty && <span className="ml-1.5 text-2xs text-ink-faint">{t('edited')}</span>}
        </button>
      )}
      {active && dirty && (
        <IconButton
          label={t('Update with current settings')}
          className="size-8"
          onClick={() => {
            overwrite(id)
            toast(t('Updated “{name}”', { name: preset.name }), 'success')
          }}
        >
          <RefreshCw size={13} />
        </IconButton>
      )}
      <IconButton
        label={t('Rename')}
        className="size-8"
        onClick={() => {
          setName(preset.name)
          setEditing(true)
        }}
      >
        <Pencil size={13} />
      </IconButton>
      <IconButton label={t('Export as file')} className="size-8" onClick={() => downloadText(`${slugify(preset.name)}.aurora.json`, serializeUserPreset(preset))}>
        <Download size={13} />
      </IconButton>
      {confirmDelete ? (
        <Button size="sm" variant="danger" onClick={() => remove(id)} onBlur={() => setConfirmDelete(false)} autoFocus>
          {t('Delete')}
        </Button>
      ) : (
        <IconButton label={t('Delete')} className="size-8" onClick={() => setConfirmDelete(true)}>
          <Trash2 size={13} />
        </IconButton>
      )}
    </li>
  )
}

export function PresetsSection() {
  const t = useT()
  const userPresets = useAppStore((s) => s.userPresets)
  const save = useAppStore((s) => s.saveUserPreset)
  const applySettings = useAppStore((s) => s.applySettings)
  const resetAll = useAppStore((s) => s.resetAll)
  const toast = useAppStore((s) => s.toast)
  const [name, setName] = useState('')
  const [pasted, setPasted] = useState('')
  const [importIssues, setImportIssues] = useState<string[]>([])
  const [confirmReset, setConfirmReset] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const nextName = t('Preset {n}', { n: userPresets.length + 1 })

  const doImport = (text: string, saveAsPreset: boolean) => {
    const result = parsePresetText(text, useAppStore.getState().settings)
    if (!result.ok) {
      toast(t(result.error), 'error')
      setImportIssues([])
      return
    }
    applySettings(result.settings, null)
    if (saveAsPreset) save(result.name)
    setImportIssues(result.warnings.slice(0, 8))
    toast(t('Imported “{name}”', { name: result.name }), 'success')
  }

  return (
    <div className="flex flex-col gap-5">
      <Group title={t('Save the current look')}>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            const n = name.trim() || nextName
            save(n)
            setName('')
            toast(t('Saved “{name}”', { name: n }), 'success')
          }}
        >
          <input
            aria-label={t('Preset name')}
            data-testid="preset-name-input"
            placeholder={nextName}
            maxLength={60}
            className="h-9 min-w-0 flex-1 rounded-[var(--radius-control)] border border-line-strong bg-graphite-800 px-3 text-xs text-ink outline-none placeholder:text-ink-faint focus:border-ice/50 pointer-coarse:h-11"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="primary" data-testid="save-preset">
            <Check size={14} /> {t('Save')}
          </Button>
        </form>
        {userPresets.length > 0 ? (
          <ul className="flex flex-col gap-1.5" aria-label={t('Your presets')}>
            {userPresets.map((p) => (
              <UserPresetRow key={p.id} id={p.id} />
            ))}
          </ul>
        ) : (
          <Hint>{t('Saved presets appear here. They stay in this browser until you export them.')}</Hint>
        )}
      </Group>

      <Group title={t('Built-in looks')}>
        <BuiltinGrid />
      </Group>

      <Group title={t('Files')}>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            data-testid="export-current"
            onClick={() => {
              const n = name.trim() || t('Aurora look')
              downloadText(`${slugify(n)}.aurora.json`, serializePreset(n, useAppStore.getState().settings))
            }}
          >
            <Download size={13} /> {t('Export current')}
          </Button>
          <Button size="sm" onClick={() => fileRef.current?.click()} data-testid="import-file">
            <FileUp size={13} /> {t('Import file')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            data-testid="import-file-input"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              if (file.size > 2_000_000) {
                toast(t('That file is too large to be a preset.'), 'error')
                return
              }
              doImport(await file.text(), true)
            }}
          />
        </div>
        <details className="group rounded-[10px] border border-line px-3 py-2">
          <summary className="cursor-pointer select-none text-xs text-ink-muted group-open:mb-2">{t('Paste preset JSON')}</summary>
          <textarea
            aria-label={t('Preset JSON')}
            data-testid="import-textarea"
            className="scroll-thin num h-28 w-full resize-y rounded-md border border-line-strong bg-graphite-950 p-2 text-2xs text-ink outline-none focus:border-ice/50"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            spellCheck={false}
          />
          <Button size="sm" className="mt-2" disabled={!pasted.trim()} onClick={() => doImport(pasted, true)} data-testid="import-pasted">
            {t('Import')}
          </Button>
        </details>
        {importIssues.length > 0 && (
          <div className="rounded-[10px] border border-warn/30 bg-warn/5 px-3 py-2" role="status">
            <p className="text-xs text-ink">{t('Imported with adjustments:')}</p>
            <ul className="mt-1 list-disc pl-4 text-2xs text-ink-muted">
              {importIssues.map((i) => (
                <li key={i}>{t(i)}</li>
              ))}
            </ul>
          </div>
        )}
        <Hint>{t('Preset files contain the look only: channels, colors, geometry and effects. Device settings such as the microphone and performance profile stay as they are.')}</Hint>
      </Group>

      <Group title={t('Start over')}>
        {confirmReset ? (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                resetAll()
                setConfirmReset(false)
                toast(t('All settings reset'))
              }}
            >
              {t('Reset all settings')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmReset(false)}>
              {t('Keep them')}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="self-start" onClick={() => setConfirmReset(true)} data-testid="reset-all">
            {t('Reset all settings…')}
          </Button>
        )}
      </Group>
    </div>
  )
}
