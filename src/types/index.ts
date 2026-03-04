export interface CarasPayload {
    muestra: string
    numero_ot: string
    fecha_ensayo: string
    realizado_por: string

    metodo_determinacion?: "MASA" | "RECUENTO" | "-" | null
    tamano_maximo_nominal_in?: string | null
    tamiz_especificado_in?: string | null
    fraccionada?: boolean | null

    masa_muestra_retenida_g?: number | null
    masa_particula_mas_grande_g?: number | null
    porcentaje_particula_mas_grande_pct?: number | null
    masa_muestra_seca_lavada_g?: number | null
    masa_muestra_seca_lavada_constante_g?: number | null
    masa_muestra_mayor_3_8_g?: number | null
    masa_muestra_menor_3_8_g?: number | null

    global_una_f_masa_fracturadas_g?: number | null
    global_una_n_masa_no_cumple_g?: number | null
    global_una_p_porcentaje_pct?: number | null

    global_dos_f_masa_fracturadas_g?: number | null
    global_dos_n_masa_no_cumple_g?: number | null
    global_dos_p_porcentaje_pct?: number | null

    fraccion_masa_menor_3_8_mayor_200g_una_g?: number | null
    fraccion_masa_menor_3_8_mayor_200g_dos_g?: number | null
    fraccion_una_f_masa_fracturadas_g?: number | null
    fraccion_una_n_masa_no_cumple_g?: number | null
    fraccion_una_p_porcentaje_pct?: number | null
    fraccion_dos_f_masa_fracturadas_g?: number | null
    fraccion_dos_n_masa_no_cumple_g?: number | null
    fraccion_dos_p_porcentaje_pct?: number | null

    promedio_ponderado_una_pct?: number | null
    promedio_ponderado_dos_pct?: number | null

    horno_codigo?: string | null
    balanza_01g_codigo?: string | null
    tamiz_especificado_codigo?: string | null

    nota?: string | null
    revisado_por?: string | null
    revisado_fecha?: string | null
    aprobado_por?: string | null
    aprobado_fecha?: string | null
}

export interface CarasEnsayoSummary {
    id: number
    numero_ensayo: string
    numero_ot: string
    cliente?: string | null
    muestra?: string | null
    fecha_documento?: string | null
    estado: string
    masa_muestra_retenida_g?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}

export interface CarasEnsayoDetail extends CarasEnsayoSummary {
    payload?: CarasPayload | null
}

export interface CarasSaveResponse {
    id: number
    numero_ensayo: string
    numero_ot: string
    estado: string
    masa_muestra_retenida_g?: number | null
    bucket?: string | null
    object_key?: string | null
    fecha_creacion?: string | null
    fecha_actualizacion?: string | null
}
