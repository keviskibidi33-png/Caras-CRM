import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import toast from 'react-hot-toast'
import { Download, Loader2, Trash2 } from 'lucide-react'
import { getCarasEnsayoDetail, saveAndDownloadCarasExcel, saveCarasEnsayo } from '@/services/api'
import type { CarasPayload } from '@/types'

const DRAFT_KEY = 'caras_form_draft_v1'
const DEBOUNCE_MS = 700

const EQ_HORNO = ['-', 'EQP-0049'] as const
const EQ_BALANZA = ['-', 'EQP-0046'] as const
const EQ_TAMIZ = ['-', 'INS-0053', 'INS-0052', 'INS-0050'] as const
const REVISADO = ['-', 'FABIAN LA ROSA'] as const
const APROBADO = ['-', 'IRMA COAQUIRA'] as const

const NOTE_1 = '(*) El tamiz especificado sera No. 4 o la designada de acuerdo a la gradacion.'
const NOTE_2 =
    '(**) Fraccionada SI, para agregados con un TMN de 3/4 in o mayor donde se debe determinar el contenido de particulas de fractura para el material retenido en el tamiz No. 4 o menor, la muestra de prueba se puede separar en el tamiz 3/8 in y la masa se reduce hasta un minimo de 200 g.'
const NOTE_3 =
    '(***) El porcentaje de la particula mas grande no representara mas de 1% de masa de muestra de ensayo o la muestra sera tan grande como se indica en la tabla 1, lo que sea menor.'
const NOTE_4 = '(****) Dato registrado solo para metodo fraccionado.'
const formatTodayShortDate = () => {
    const d = new Date()
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(-2)
    return `${dd}/${mm}/${yy}`
}
const getCurrentYearShort = () => new Date().getFullYear().toString().slice(-2)
const normalizeFlexibleDate = (raw: string): string => {
    const value = raw.trim()
    if (!value) return ''
    const digits = value.replace(/\D/g, '')
    const year = getCurrentYearShort()
    const pad2 = (part: string) => part.padStart(2, '0').slice(-2)
    const build = (d: string, m: string, y: string = year) => `${pad2(d)}/${pad2(m)}/${pad2(y)}`

    if (value.includes('/')) {
        const [d = '', m = '', yRaw = ''] = value.split('/').map((part) => part.trim())
        if (!d || !m) return value
        let yy = yRaw.replace(/\D/g, '')
        if (yy.length === 4) yy = yy.slice(-2)
        if (yy.length === 1) yy = `0${yy}`
        if (!yy) yy = year
        return build(d, m, yy)
    }

    if (digits.length === 2) return build(digits[0], digits[1])
    if (digits.length === 3) return build(digits[0], digits.slice(1, 3))
    if (digits.length === 4) return build(digits.slice(0, 2), digits.slice(2, 4))
    if (digits.length === 5) return build(digits[0], digits.slice(1, 3), digits.slice(3, 5))
    if (digits.length === 6) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 6))
    if (digits.length >= 8) return build(digits.slice(0, 2), digits.slice(2, 4), digits.slice(6, 8))
    return value
}

const initialState = (): CarasPayload => ({
    muestra: '',
    numero_ot: '',
    fecha_ensayo: formatTodayShortDate(),
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
    revisado_fecha: formatTodayShortDate(),
    aprobado_por: '-',
    aprobado_fecha: formatTodayShortDate(),
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

const weightedPct = (
    pg: number | null,
    mg: number | null | undefined,
    pf: number | null,
    mf: number | null | undefined,
): number | null => {
    if (pg == null) return null
    if (pf == null || mf == null || mf <= 0) return Number(pg.toFixed(4))
    const g = mg ?? 0
    const total = g + mf
    if (total <= 0) return Number(pg.toFixed(4))
    return Number((((pg * g) + pf * mf) / total).toFixed(4))
}

const getEnsayoId = (): number | null => {
    const raw = new URLSearchParams(window.location.search).get('ensayo_id')
    if (!raw) return null
    const n = Number(raw)
    return Number.isInteger(n) && n > 0 ? n : null
}

const formatDisplay = (value: number | null): string => {
    if (value == null) return '-'
    return value.toFixed(4)
}

const INPUT_BASE_CLASS =
    'caras-input h-7 w-full border border-[#4b4b4b] bg-white px-1.5 text-[12px] text-black outline-none focus:ring-1 focus:ring-black'

function MarkOption({
    active,
    label,
    onClick,
}: {
    active: boolean
    label: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex items-center gap-1 text-[11px] leading-none text-black"
            aria-pressed={active}
        >
            <span className="flex h-4 w-4 items-center justify-center border border-black text-[11px] font-bold">
                {active ? 'X' : ''}
            </span>
            <span>{label}</span>
        </button>
    )
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

    const g1 = useMemo(
        () => calcPct(form.global_una_f_masa_fracturadas_g, form.global_una_n_masa_no_cumple_g),
        [form.global_una_f_masa_fracturadas_g, form.global_una_n_masa_no_cumple_g],
    )
    const g2 = useMemo(
        () => calcPct(form.global_dos_f_masa_fracturadas_g, form.global_dos_n_masa_no_cumple_g),
        [form.global_dos_f_masa_fracturadas_g, form.global_dos_n_masa_no_cumple_g],
    )
    const f1 = useMemo(
        () => calcPct(form.fraccion_una_f_masa_fracturadas_g, form.fraccion_una_n_masa_no_cumple_g),
        [form.fraccion_una_f_masa_fracturadas_g, form.fraccion_una_n_masa_no_cumple_g],
    )
    const f2 = useMemo(
        () => calcPct(form.fraccion_dos_f_masa_fracturadas_g, form.fraccion_dos_n_masa_no_cumple_g),
        [form.fraccion_dos_f_masa_fracturadas_g, form.fraccion_dos_n_masa_no_cumple_g],
    )
    const p1 = useMemo(
        () =>
            weightedPct(
                g1,
                form.masa_muestra_mayor_3_8_g,
                f1,
                form.fraccion_masa_menor_3_8_mayor_200g_una_g,
            ),
        [g1, form.masa_muestra_mayor_3_8_g, f1, form.fraccion_masa_menor_3_8_mayor_200g_una_g],
    )
    const p2 = useMemo(
        () =>
            weightedPct(
                g2,
                form.masa_muestra_mayor_3_8_g,
                f2,
                form.fraccion_masa_menor_3_8_mayor_200g_dos_g,
            ),
        [g2, form.masa_muestra_mayor_3_8_g, f2, form.fraccion_masa_menor_3_8_mayor_200g_dos_g],
    )

    const setField = useCallback(<K extends keyof CarasPayload>(key: K, value: CarasPayload[K]) => {
        setForm((prev) => ({ ...prev, [key]: value }))
    }, [])

    useEffect(() => {
        const raw = localStorage.getItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`)
        if (!raw) return
        try {
            setForm({ ...initialState(), ...JSON.parse(raw) })
        } catch {
            // ignore localStorage corruption
        }
    }, [editingEnsayoId])

    useEffect(() => {
        const timer = window.setTimeout(() => {
            localStorage.setItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`, JSON.stringify(form))
        }, DEBOUNCE_MS)
        return () => window.clearTimeout(timer)
    }, [editingEnsayoId, form])

    useEffect(() => {
        if (!editingEnsayoId) return
        let cancelled = false
        const run = async () => {
            setLoadingEdit(true)
            try {
                const detail = await getCarasEnsayoDetail(editingEnsayoId)
                if (!cancelled && detail.payload) {
                    setForm({ ...initialState(), ...detail.payload })
                }
            } catch {
                toast.error('No se pudo cargar ensayo Caras para edicion.')
            } finally {
                if (!cancelled) setLoadingEdit(false)
            }
        }
        void run()
        return () => {
            cancelled = true
        }
    }, [editingEnsayoId])

    const clearAll = useCallback(() => {
        if (!window.confirm('Se limpiaran los datos no guardados. Deseas continuar?')) return
        localStorage.removeItem(`${DRAFT_KEY}:${editingEnsayoId ?? 'new'}`)
        setForm(initialState())
    }, [editingEnsayoId])

    const save = useCallback(
        async (download: boolean) => {
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
                if (window.parent !== window) {
                    window.parent.postMessage({ type: 'CLOSE_MODAL' }, '*')
                }
                toast.success(download ? 'Caras guardado y descargado.' : 'Caras guardado.')
            } catch (error: unknown) {
                let msg = error instanceof Error ? error.message : 'Error desconocido'
                if (axios.isAxiosError(error) && typeof error.response?.data?.detail === 'string') {
                    msg = error.response.data.detail
                }
                toast.error(`Error guardando Caras: ${msg}`)
            } finally {
                setLoading(false)
            }
        },
        [editingEnsayoId, f1, f2, form, g1, g2, p1, p2, pctParticula],
    )

    const renderNumberInput = (key: keyof CarasPayload) => (
        <input
            type="number"
            step="any"
            value={form[key] == null ? '' : String(form[key])}
            onChange={(e) => setField(key, parseNum(e.target.value) as CarasPayload[typeof key])}
            autoComplete="off"
            data-lpignore="true"
            className={INPUT_BASE_CLASS}
        />
    )

    const renderTextInput = (key: keyof CarasPayload, placeholder = '', extraClass = '', onBlur?: () => void) => (
        <input
            type="text"
            value={String(form[key] ?? '')}
            onChange={(e) => setField(key, e.target.value as CarasPayload[typeof key])}
            onBlur={onBlur}
            autoComplete="off"
            data-lpignore="true"
            placeholder={placeholder}
            className={`${INPUT_BASE_CLASS} ${extraClass}`.trim()}
        />
    )

    const renderSelect = (key: keyof CarasPayload, options: readonly string[]) => (
        <select
            value={String(form[key] ?? '-')}
            onChange={(e) => setField(key, e.target.value as CarasPayload[typeof key])}
            className={`${INPUT_BASE_CLASS} pr-6`}
            autoComplete="off"
            data-lpignore="true"
        >
            {options.map((option) => (
                <option key={option} value={option}>
                    {option}
                </option>
            ))}
        </select>
    )

    return (
        <div className="caras-page min-h-screen bg-[#e9ecef] px-2 py-4 md:px-4">
            <div className="mx-auto max-w-[1600px]">
                {loadingEdit ? (
                    <div className="mb-3 flex h-9 items-center gap-2 border border-[#4b4b4b] bg-white px-3 text-[12px] text-black">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Cargando ensayo...
                    </div>
                ) : null}

                <div className="overflow-x-auto border border-[#1f4f8f] bg-white p-2 md:p-3">
                    <div className="caras-sheet min-w-[1180px] border border-[#4b4b4b] bg-white">
                        <div className="grid grid-cols-4 border-b border-[#4b4b4b] bg-[#f8f8f8] text-center text-[13px] font-bold">
                            <div className="border-r border-[#4b4b4b] py-1">MUESTRA</div>
                            <div className="border-r border-[#4b4b4b] py-1">N° OT</div>
                            <div className="border-r border-[#4b4b4b] py-1">FECHA DE ENSAYO</div>
                            <div className="py-1">REALIZADO</div>
                        </div>

                        <div className="grid grid-cols-4 border-b border-[#4b4b4b]">
                            <div className="border-r border-[#4b4b4b] p-1">{renderTextInput('muestra', 'Muestra')}</div>
                            <div className="border-r border-[#4b4b4b] p-1">{renderTextInput('numero_ot', 'N° OT')}</div>
                            <div className="border-r border-[#4b4b4b] p-1">{renderTextInput('fecha_ensayo', 'DD/MM/AA', '', () => setField('fecha_ensayo', normalizeFlexibleDate(String(form.fecha_ensayo ?? ''))))}</div>
                            <div className="p-1">{renderTextInput('realizado_por', 'Realizado por')}</div>
                        </div>

                        <div className="border-b border-[#4b4b4b] bg-[#f4f4f4] px-2 py-1 text-center">
                            <p className="text-[21px] font-bold leading-tight">
                                STANDARD TEST METHOD FOR DETERMINING THE PERCENTAGE OF FRACTURED PARTICLES IN COARSE AGGREGATE
                            </p>
                            <p className="text-[24px] font-bold leading-tight">ASTM D5821-13 (Reapproved 2025)</p>
                        </div>

                        <div className="grid grid-cols-[3fr_2fr] border-b border-[#4b4b4b]">
                            <div className="border-r border-[#4b4b4b]">
                                <div className="border-b border-[#4b4b4b] px-2 py-1 text-[13px] font-bold">
                                    INFORMACION DEL ENSAYO (Marcar "X")
                                </div>
                                <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">
                                        Metodo para la determinacion del porcentaje de particulas fracturadas
                                    </div>
                                    <div className="border-r border-[#4b4b4b] px-2 py-1">
                                        <MarkOption
                                            label="Masa"
                                            active={form.metodo_determinacion !== 'RECUENTO'}
                                            onClick={() => setField('metodo_determinacion', 'MASA')}
                                        />
                                    </div>
                                    <div className="px-2 py-1">
                                        <MarkOption
                                            label="Recuento"
                                            active={form.metodo_determinacion === 'RECUENTO'}
                                            onClick={() => setField('metodo_determinacion', 'RECUENTO')}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-[2fr_2fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Tamano Maximo Nominal (in)</div>
                                    <div className="p-1">{renderTextInput('tamano_maximo_nominal_in')}</div>
                                </div>
                                <div className="grid grid-cols-[2fr_2fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Tamiz especificado (in) (*)</div>
                                    <div className="p-1">{renderTextInput('tamiz_especificado_in')}</div>
                                </div>
                                <div className="grid grid-cols-[2fr_1fr_1fr]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Fraccionada (**)</div>
                                    <div className="border-r border-[#4b4b4b] px-2 py-1">
                                        <MarkOption
                                            label="SI"
                                            active={form.fraccionada === true}
                                            onClick={() => setField('fraccionada', form.fraccionada === true ? null : true)}
                                        />
                                    </div>
                                    <div className="px-2 py-1">
                                        <MarkOption
                                            label="NO"
                                            active={form.fraccionada === false}
                                            onClick={() => setField('fraccionada', form.fraccionada === false ? null : false)}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="border-b border-[#4b4b4b] px-2 py-1 text-center text-[13px] font-bold">Codigo equipos utilizados</div>
                                <div className="grid grid-cols-[1.4fr_1.6fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Horno</div>
                                    <div className="p-1">{renderSelect('horno_codigo', EQ_HORNO)}</div>
                                </div>
                                <div className="grid grid-cols-[1.4fr_1.6fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Balanza 0.1 g</div>
                                    <div className="p-1">{renderSelect('balanza_01g_codigo', EQ_BALANZA)}</div>
                                </div>
                                <div className="grid grid-cols-[1.4fr_1.6fr] border-b border-[#4b4b4b]">
                                    <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Tamiz especificado</div>
                                    <div className="p-1">{renderSelect('tamiz_especificado_codigo', EQ_TAMIZ)}</div>
                                </div>
                                <div className="px-2 py-1 text-[11px] leading-tight">
                                    <p className="text-center">Tabla peso minimo</p>
                                    <p className="text-center">Fuente: Norma ASTM D5821-13 (Reapproved 2025)</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-b border-[#4b4b4b]">
                            <div className="border-b border-[#4b4b4b] px-2 py-1 text-[13px] font-bold">MUESTRA ORIGINAL DE ENSAYO</div>

                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">
                                    (A) Masa de la muestra retenida en el tamiz especificado (g)
                                </div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_muestra_retenida_g')}</div>
                                <div className="p-1" />
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">(B) Masa de la particula mas grande (g)</div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_particula_mas_grande_g')}</div>
                                <div className="p-1" />
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">
                                    Porcentaje en masa de la particula mas grande (%) (***) (B*100/A)
                                </div>
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">{pctParticula == null ? '' : formatDisplay(pctParticula)}</div>
                                <div className="px-2 py-1 text-[12px]">&lt;=1% cumple</div>
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Masa de la muestra seca lavada (g)</div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_muestra_seca_lavada_g')}</div>
                                <div className="p-1" />
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Masa de la muestra seca lavada constante (g)</div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_muestra_seca_lavada_constante_g')}</div>
                                <div className="p-1" />
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr] border-b border-[#4b4b4b]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Masa de la muestra &gt; 3/8 (g) (****)</div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_muestra_mayor_3_8_g')}</div>
                                <div className="p-1" />
                            </div>
                            <div className="grid grid-cols-[3fr_1fr_1fr]">
                                <div className="border-r border-[#4b4b4b] px-2 py-1 text-[12px]">Masa de la muestra &lt; 3/8 (g) (****)</div>
                                <div className="border-r border-[#4b4b4b] p-1">{renderNumberInput('masa_muestra_menor_3_8_g')}</div>
                                <div className="p-1" />
                            </div>
                        </div>

                        <div className="border-b border-[#4b4b4b] px-2 py-1.5 text-[11px] italic leading-tight">
                            <p>{NOTE_1}</p>
                            <p>{NOTE_2}</p>
                            <p>{NOTE_3}</p>
                            <p>{NOTE_4}</p>
                        </div>

                        <table className="w-full border-b border-[#4b4b4b] text-[12px]">
                            <thead>
                                <tr className="bg-[#f8f8f8]">
                                    <th className="border-r border-b border-[#4b4b4b] px-2 py-1.5 text-center font-bold">MUESTRA DE PRUEBA</th>
                                    <th className="border-r border-b border-[#4b4b4b] px-2 py-1.5 text-center font-bold">Particulas con una o mas caras fracturadas</th>
                                    <th className="border-b border-[#4b4b4b] px-2 py-1.5 text-center font-bold">Particulas con dos o mas caras fracturadas</th>
                                </tr>
                                <tr>
                                    <th className="border-r border-b border-[#4b4b4b] px-2 py-1 text-left font-normal" />
                                    <th className="border-r border-b border-[#4b4b4b] px-2 py-1 text-center font-semibold">(1) &gt; 3/8 in o Global</th>
                                    <th className="border-b border-[#4b4b4b] px-2 py-1 text-center font-semibold">(1) &gt; 3/8 in o Global</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Masa particulas fracturadas (g)</td>
                                    <td className="border-r border-b border-[#4b4b4b] p-1">{renderNumberInput('global_una_f_masa_fracturadas_g')}</td>
                                    <td className="border-b border-[#4b4b4b] p-1">{renderNumberInput('global_dos_f_masa_fracturadas_g')}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Masa particulas que no cumplen el criterio especificado (g)</td>
                                    <td className="border-r border-b border-[#4b4b4b] p-1">{renderNumberInput('global_una_n_masa_no_cumple_g')}</td>
                                    <td className="border-b border-[#4b4b4b] p-1">{renderNumberInput('global_dos_n_masa_no_cumple_g')}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Porcentaje de particulas con caras fracturadas (%)</td>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1 text-center">{formatDisplay(g1)}</td>
                                    <td className="border-b border-[#4b4b4b] px-2 py-1 text-center">{formatDisplay(g2)}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1 text-left font-semibold" />
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1 text-center font-semibold">(2) &lt; 3/8 in</td>
                                    <td className="border-b border-[#4b4b4b] px-2 py-1 text-center font-semibold">(2) &lt; 3/8 in</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Masa de la muestra &lt; 3/8 (g), FRACCION MAYOR DE 200 g</td>
                                    <td className="border-r border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_masa_menor_3_8_mayor_200g_una_g')}</td>
                                    <td className="border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_masa_menor_3_8_mayor_200g_dos_g')}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Masa particulas fracturadas (g)</td>
                                    <td className="border-r border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_una_f_masa_fracturadas_g')}</td>
                                    <td className="border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_dos_f_masa_fracturadas_g')}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Masa particulas que no cumplen el criterio especificado (g)</td>
                                    <td className="border-r border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_una_n_masa_no_cumple_g')}</td>
                                    <td className="border-b border-[#4b4b4b] p-1">{renderNumberInput('fraccion_dos_n_masa_no_cumple_g')}</td>
                                </tr>
                                <tr>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1">Porcentaje de particulas con caras fracturadas (%)</td>
                                    <td className="border-r border-b border-[#4b4b4b] px-2 py-1 text-center">{formatDisplay(f1)}</td>
                                    <td className="border-b border-[#4b4b4b] px-2 py-1 text-center">{formatDisplay(f2)}</td>
                                </tr>
                                <tr className="bg-[#f8f8f8]">
                                    <td className="border-r border-[#4b4b4b] px-2 py-1 font-semibold">Promedio Ponderado (%)</td>
                                    <td className="border-r border-[#4b4b4b] px-2 py-1 text-center font-semibold">{formatDisplay(p1)}</td>
                                    <td className="px-2 py-1 text-center font-semibold">{formatDisplay(p2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        <div className="border-b border-[#4b4b4b] px-2 py-1 text-[12px] font-bold">Nota:</div>
                        <div className="border-b border-[#4b4b4b] p-1">
                            <textarea
                                value={form.nota || ''}
                                onChange={(e) => setField('nota', e.target.value)}
                                rows={3}
                                className="caras-input w-full resize-none border border-[#4b4b4b] bg-white px-2 py-1 text-[12px] outline-none focus:ring-1 focus:ring-black"
                                autoComplete="off"
                                data-lpignore="true"
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-5 border-b border-[#4b4b4b] px-8 py-3">
                            <div className="border border-[#4b4b4b] p-2">
                                <p className="mb-1 text-[12px] font-semibold">Revisado:</p>
                                <div className="mb-1">{renderSelect('revisado_por', REVISADO)}</div>
                                <p className="mb-1 text-[12px] font-semibold">Fecha:</p>
                                {renderTextInput('revisado_fecha', 'DD/MM/AA', '', () => setField('revisado_fecha', normalizeFlexibleDate(String(form.revisado_fecha ?? ''))))}
                            </div>
                            <div className="border border-[#4b4b4b] p-2">
                                <p className="mb-1 text-[12px] font-semibold">Aprobado:</p>
                                <div className="mb-1">{renderSelect('aprobado_por', APROBADO)}</div>
                                <p className="mb-1 text-[12px] font-semibold">Fecha:</p>
                                {renderTextInput('aprobado_fecha', 'DD/MM/AA', '', () => setField('aprobado_fecha', normalizeFlexibleDate(String(form.aprobado_fecha ?? ''))))}
                            </div>
                        </div>

                        <div className="px-2 py-1 text-[12px]">Pagina 1 de 1</div>
                        <div className="px-2 pb-1 text-[12px]">Version: 03 (2026-02-12)</div>
                        <div className="border-t-4 border-[#1f4f8f] px-2 py-1 text-center text-[12px]">
                            WEB: www.geofal.com.pe, E-MAIL: laboratorio@geofal.com.pe
                            <br />
                            Av. Maranon 763, Los Olivos-Lima / Telefono: 01 754-3070
                        </div>
                    </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
                    <button
                        onClick={clearAll}
                        type="button"
                        className="flex h-10 items-center justify-center gap-1.5 border border-[#4b4b4b] bg-white text-[12px] font-semibold text-black hover:bg-[#f2f2f2]"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Limpiar
                    </button>
                    <button
                        onClick={() => void save(false)}
                        disabled={loading}
                        type="button"
                        className="h-10 border border-[#4b4b4b] bg-white text-[12px] font-semibold text-black hover:bg-[#f2f2f2] disabled:opacity-60"
                    >
                        {loading ? 'Guardando...' : 'Guardar'}
                    </button>
                    <button
                        onClick={() => void save(true)}
                        disabled={loading}
                        type="button"
                        className="flex h-10 items-center justify-center gap-1.5 border border-[#4b4b4b] bg-black text-[12px] font-semibold text-white hover:bg-[#1f1f1f] disabled:opacity-60"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Procesando...
                            </>
                        ) : (
                            <>
                                <Download className="h-3.5 w-3.5" />
                                Guardar y descargar Excel
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
