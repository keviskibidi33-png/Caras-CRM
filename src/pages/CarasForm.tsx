import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Beaker, Download, Loader2, Trash2 } from 'lucide-react'
import { getCarasEnsayoDetail, saveAndDownloadCarasExcel, saveCarasEnsayo } from '@/services/api'
import type { CarasPayload } from '@/types'

const DRAFT_KEY = 'caras_form_draft_v1'
const DEBOUNCE_MS = 700

const EQ_HORNO = ['-', 'EQP-0049'] as const
const EQ_BALANZA = ['-', 'EQP-0046'] as const
const EQ_TAMIZ = ['-', 'INS-0053', 'INS-0052', 'INS-0050'] as const
const REVISADO = ['-', 'FABIAN LA ROSA'] as const
const APROBADO = ['-', 'IRMA COAQUIRA'] as const

const initialState = (): CarasPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: '',
    realizado_por: '',
    metodo_determinacion: 'MASA',
    tamano_maximo_nominal_in: '',
    tamiz_especificado_in: '',
    fraccionada: null,
    masa_muestra_retenida_g: null,
    masa_particula_mas_grande_g: null,
    porcentaje_particula_mas_grande_pct: null,
    masa_muestra_seca_lavada_g: null,
    masa_muestra_seca_lavada_constante_g: null,
    masa_muestra_mayor_3_8_g: null,
    masa_muestra_menor_3_8_g: null,
    global_una_f_masa_fracturadas_g: null,
    global_una_n_masa_no_cumple_g: null,
    global_una_p_porcentaje_pct: null,
    global_dos_f_masa_fracturadas_g: null,
    global_dos_n_masa_no_cumple_g: null,
    global_dos_p_porcentaje_pct: null,
    fraccion_masa_menor_3_8_mayor_200g_una_g: null,
    fraccion_masa_menor_3_8_mayor_200g_dos_g: null,
    fraccion_una_f_masa_fracturadas_g: null,
    fraccion_una_n_masa_no_cumple_g: null,
    fraccion_una_p_porcentaje_pct: null,
    fraccion_dos_f_masa_fracturadas_g: null,
    fraccion_dos_n_masa_no_cumple_g: null,
    fraccion_dos_p_porcentaje_pct: null,
    promedio_ponderado_una_pct: null,
    promedio_ponderado_dos_pct: null,
    horno_codigo: 'EQP-0049',
    balanza_01g_codigo: 'EQP-0046',
    tamiz_especificado_codigo: 'INS-0053',
    nota: '',
    revisado_por: '-',
    revisado_fecha: '',
    aprobado_por: '-',
    aprobado_fecha: '',
})

const parseNum = (raw: string): number | null => {
    if (!raw.trim()) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
}

const calcPct = (f: number | null | undefined, n: number | null | undefined): number | null => {
    if (f == null || n == null) return null
    const total = f + n
    if (total <= 0) return null
    return Number(((f / total) * 100).toFixed(4))
}

const weightedPct = (pg: number | null, mg: number | null | undefined, pf: number | null, mf: number | null | undefined): number | null => {
    if (pg == null) return null
    if (pf == null || mf == null || mf <= 0) return Number(pg.toFixed(4))
    const g = mg ?? 0
    const total = g + mf
    if (total <= 0) return Number(pg.toFixed(4))
    return Number((((pg * g) + (pf * mf)) / total).toFixed(4))
}

const getEnsayoId = (): number | null => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
}

export default function CarasForm() {
    const [form, setForm] = useState<CarasPayload>(() => initialState())
    const [loading, setLoading] = useState(false)
    const [loadingEdit, setLoadingEdit] = useState(false)
    const [editingEnsayoId, setEditingEnsayoId] = useState<number | null>(() => getEnsayoId())

    const pctParticula = useMemo(() => {
        const a = form.masa_muestra_retenida_g
        const b = form.masa_particula_mas_grande_g
        if (a == null || b == null || a <= 0) return null
        return Number(((b / a) * 100).toFixed(4))
    }, [form.masa_muestra_retenida_g, form.masa_particula_mas_grande_g])
    const g1 = useMemo(() => calcPct(form.global_una_f_masa_fracturadas_g, form.global_una_n_masa_no_cumple_g), [form.global_una_f_masa_fracturadas_g, form.global_una_n_masa_no_cumple_g])
    const g2 = useMemo(() => calcPct(form.global_dos_f_masa_fracturadas_g, form.global_dos_n_masa_no_cumple_g), [form.global_dos_f_masa_fracturadas_g, form.global_dos_n_masa_no_cumple_g])
    const f1 = useMemo(() => calcPct(form.fraccion_una_f_masa_fracturadas_g, form.fraccion_una_n_masa_no_cumple_g), [form.fraccion_una_f_masa_fracturadas_g, form.fraccion_una_n_masa_no_cumple_g])
    const f2 = useMemo(() => calcPct(form.fraccion_dos_f_masa_fracturadas_g, form.fraccion_dos_n_masa_no_cumple_g), [form.fraccion_dos_f_masa_fracturadas_g, form.fraccion_dos_n_masa_no_cumple_g])
    const p1 = useMemo(() => weightedPct(g1, form.masa_muestra_mayor_3_8_g, f1, form.fraccion_masa_menor_3_8_mayor_200g_una_g), [g1, form.masa_muestra_mayor_3_8_g, f1, form.fraccion_masa_menor_3_8_mayor_200g_una_g])
    const p2 = useMemo(() => weightedPct(g2, form.masa_muestra_mayor_3_8_g, f2, form.fraccion_masa_menor_3_8_mayor_200g_dos_g), [g2, form.masa_muestra_mayor_3_8_g, f2, form.fraccion_masa_menor_3_8_mayor_200g_dos_g])

    const setField = useCallback(<K extends keyof CarasPayload>(key: K, value: CarasPayload[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const raw = localStorage.getItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`)
        if (!raw) return
        try { setForm({ ...initialState(), ...JSON.parse(raw) }) } catch { /* ignore */ }
    }, [editingEnsayoId])

    useEffect(() => {
        const timer = window.setTimeout(() => localStorage.setItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`, JSON.stringify(form)), DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [editingEnsayoId, form])

    useEffect(() => {
        if (!editingEnsayoId) return
        let cancelled = false
        const run = async () => {
            setLoadingEdit(true)
            try {
                const detail = await getCarasEnsayoDetail(editingEnsayoId)
                if (!cancelled && detail.payload) setForm({ ...initialState(), ...detail.payload })
            } catch {
                toast.error('No se pudo cargar ensayo Caras para edición.')
            } finally {
                if (!cancelled) setLoadingEdit(false)
            }
        }
        void run()
        return () => { cancelled = true }
    }, [editingEnsayoId])

    const clearAll = useCallback(() => {
        if (!window.confirm('Se limpiarán los datos no guardados. ¿Deseas continuar?')) return
        localStorage.removeItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`)
        setForm(initialState())
    }, [editingEnsayoId])

    const save = useCallback(async (download: boolean) => {
        if (!form.muestra || !form.numero_ot || !form.realizado_por) {
            toast.error('Complete Muestra, N° OT y Realizado por.')
            return
        }
        setLoading(true)
        try {
            const payload: CarasPayload = {
                ...form,
                porcentaje_particula_mas_grande_pct: pctParticula,
                global_una_p_porcentaje_pct: g1,
                global_dos_p_porcentaje_pct: g2,
                fraccion_una_p_porcentaje_pct: f1,
                fraccion_dos_p_porcentaje_pct: f2,
                promedio_ponderado_una_pct: p1,
                promedio_ponderado_dos_pct: p2,
            }
            if (download) {
                const { blob } = await saveAndDownloadCarasExcel(payload, editingEnsayoId ?? undefined)
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `CARAS_${payload.numero_ot}_${new Date().toISOString().slice(0, 10)}.xlsx`
                a.click()
                URL.revokeObjectURL(url)
            } else {
                await saveCarasEnsayo(payload, editingEnsayoId ?? undefined)
            }
            localStorage.removeItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`)
            setForm(initialState())
            setEditingEnsayoId(null)
            if (window.parent !== window) window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
            toast.success(download ? 'Caras guardado y descargado.' : 'Caras guardado.')
        } catch (error: unknown) {
            let msg = error instanceof Error ? error.message : 'Error desconocido'
            if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') msg = error.response.data.detail
            toast.error(`Error guardando Caras: ${msg}`)
        } finally {
            setLoading(false)
        }
    }, [editingEnsayoId, form, pctParticula, g1, g2, f1, f2, p1, p2])

    const num = (k: keyof CarasPayload) => (
        <input
            type="number"
            step="any"
            value={form[k] == null ? '' : String(form[k])}
            onChange={(e) => setField(k, parseNum(e.target.value) as CarasPayload[typeof k])}
            className="w-full h-8 px-2 rounded border border-input bg-background"
        />
    )

    const sel = (k: keyof CarasPayload, options: readonly string[]) => (
        <select
            value={(form[k] as string) || '-'}
            onChange={(e) => setField(k, e.target.value as CarasPayload[typeof k])}
            className="w-full h-9 px-2 rounded border border-input bg-background text-sm"
        >
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
    )

    return (
        <div className="max-w-[1500px] mx-auto p-4 md:p-6">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-primary/10"><Beaker className="h-6 w-6 text-primary" /></div>
                <div><h1 className="text-xl font-bold">Caras Fracturadas - ASTM D5821-13</h1><p className="text-sm text-muted-foreground">Formulario operativo</p></div>
            </div>
            {loadingEdit ? <div className="mb-4 h-10 rounded-lg border border-border bg-muted/40 px-3 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Cargando ensayo...</div> : null}

            <div className="bg-card border border-border rounded-lg p-4 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input value={form.muestra} onChange={(e) => setField('muestra', e.target.value)} placeholder="Muestra" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                    <input value={form.numero_ot} onChange={(e) => setField('numero_ot', e.target.value)} placeholder="N° OT" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                    <input value={form.fecha_ensayo} onChange={(e) => setField('fecha_ensayo', e.target.value)} placeholder="Fecha ensayo DD/MM/AA" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                    <input value={form.realizado_por} onChange={(e) => setField('realizado_por', e.target.value)} placeholder="Realizado por" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    <div className="xl:col-span-2 border border-border rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-muted/40 font-semibold text-sm">Información del ensayo</div>
                        <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>{sel('metodo_determinacion', ['MASA', 'RECUENTO'])}</div>
                            <select value={form.fraccionada == null ? '-' : (form.fraccionada ? 'SI' : 'NO')} onChange={(e) => setField('fraccionada', e.target.value === '-' ? null : e.target.value === 'SI')} className="h-9 px-2 rounded border border-input bg-background text-sm"><option value="-">Fraccionada -</option><option value="SI">Fraccionada SI</option><option value="NO">Fraccionada NO</option></select>
                            <input value={form.tamano_maximo_nominal_in || ''} onChange={(e) => setField('tamano_maximo_nominal_in', e.target.value)} placeholder="TMN (in)" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                            <input value={form.tamiz_especificado_in || ''} onChange={(e) => setField('tamiz_especificado_in', e.target.value)} placeholder="Tamiz especificado (in)" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                        </div>
                    </div>
                    <div className="border border-border rounded-lg overflow-hidden">
                        <div className="px-3 py-2 bg-muted/40 font-semibold text-sm">Equipos</div>
                        <div className="p-3 space-y-2">{sel('horno_codigo', EQ_HORNO)}{sel('balanza_01g_codigo', EQ_BALANZA)}{sel('tamiz_especificado_codigo', EQ_TAMIZ)}</div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {num('masa_muestra_retenida_g')}{num('masa_particula_mas_grande_g')}
                    <input value={pctParticula ?? ''} readOnly className="h-8 px-2 rounded border border-input bg-muted/30 text-sm" />
                    {num('masa_muestra_seca_lavada_g')}{num('masa_muestra_seca_lavada_constante_g')}{num('masa_muestra_mayor_3_8_g')}
                    {num('masa_muestra_menor_3_8_g')}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[980px] border border-border text-sm">
                        <thead><tr className="bg-muted/30"><th className="border border-border px-3 py-2 text-left">Descripción</th><th className="border border-border px-3 py-2 text-center">Una o más caras</th><th className="border border-border px-3 py-2 text-center">Dos o más caras</th></tr></thead>
                        <tbody>
                            <tr className="bg-muted/20"><td className="border border-border px-3 py-2 font-semibold">&gt; 3/8 in o Global</td><td className="border border-border px-2 py-1.5">{num('global_una_f_masa_fracturadas_g')}</td><td className="border border-border px-2 py-1.5">{num('global_dos_f_masa_fracturadas_g')}</td></tr>
                            <tr><td className="border border-border px-3 py-2">N) Masa no cumple (g)</td><td className="border border-border px-2 py-1.5">{num('global_una_n_masa_no_cumple_g')}</td><td className="border border-border px-2 py-1.5">{num('global_dos_n_masa_no_cumple_g')}</td></tr>
                            <tr><td className="border border-border px-3 py-2">P) Porcentaje (%)</td><td className="border border-border px-3 py-2 text-center bg-muted/20">{g1 ?? '-'}</td><td className="border border-border px-3 py-2 text-center bg-muted/20">{g2 ?? '-'}</td></tr>
                            <tr className="bg-muted/20"><td className="border border-border px-3 py-2 font-semibold">&lt; 3/8 in (fracción)</td><td className="border border-border px-2 py-1.5">{num('fraccion_masa_menor_3_8_mayor_200g_una_g')}</td><td className="border border-border px-2 py-1.5">{num('fraccion_masa_menor_3_8_mayor_200g_dos_g')}</td></tr>
                            <tr><td className="border border-border px-3 py-2">F) Masa fracturadas (g)</td><td className="border border-border px-2 py-1.5">{num('fraccion_una_f_masa_fracturadas_g')}</td><td className="border border-border px-2 py-1.5">{num('fraccion_dos_f_masa_fracturadas_g')}</td></tr>
                            <tr><td className="border border-border px-3 py-2">N) Masa no cumple (g)</td><td className="border border-border px-2 py-1.5">{num('fraccion_una_n_masa_no_cumple_g')}</td><td className="border border-border px-2 py-1.5">{num('fraccion_dos_n_masa_no_cumple_g')}</td></tr>
                            <tr><td className="border border-border px-3 py-2">P) Porcentaje (%)</td><td className="border border-border px-3 py-2 text-center bg-muted/20">{f1 ?? '-'}</td><td className="border border-border px-3 py-2 text-center bg-muted/20">{f2 ?? '-'}</td></tr>
                            <tr className="bg-muted/20 font-semibold"><td className="border border-border px-3 py-2">Promedio ponderado (%)</td><td className="border border-border px-3 py-2 text-center">{p1 ?? '-'}</td><td className="border border-border px-3 py-2 text-center">{p2 ?? '-'}</td></tr>
                        </tbody>
                    </table>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                    <textarea value={form.nota || ''} onChange={(e) => setField('nota', e.target.value)} rows={6} className="w-full px-3 py-2 rounded border border-input bg-background text-sm resize-none" placeholder="Nota" />
                    <div className="space-y-2">
                        {sel('revisado_por', REVISADO)}
                        <input value={form.revisado_fecha || ''} onChange={(e) => setField('revisado_fecha', e.target.value)} placeholder="Fecha revisado DD/MM/AA" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                    </div>
                    <div className="space-y-2">
                        {sel('aprobado_por', APROBADO)}
                        <input value={form.aprobado_fecha || ''} onChange={(e) => setField('aprobado_fecha', e.target.value)} placeholder="Fecha aprobado DD/MM/AA" className="h-9 px-3 rounded border border-input bg-background text-sm" />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <button onClick={clearAll} type="button" className="h-11 rounded-lg border border-border font-semibold hover:bg-muted/40 flex items-center justify-center gap-2"><Trash2 className="h-4 w-4" />Limpiar</button>
                    <button onClick={() => void save(false)} disabled={loading} type="button" className="h-11 rounded-lg border border-primary text-primary font-semibold hover:bg-primary/10 disabled:opacity-50">{loading ? 'Guardando...' : 'Guardar'}</button>
                    <button onClick={() => void save(true)} disabled={loading} type="button" className="h-11 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2">{loading ? <><Loader2 className="h-4 w-4 animate-spin" />Procesando...</> : <><Download className="h-4 w-4" />Guardar y descargar Excel</>}</button>
                </div>
            </div>
        </div>
    )
}
