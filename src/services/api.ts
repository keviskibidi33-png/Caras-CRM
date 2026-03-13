import axios from 'axios'
import type {
    CarasPayload,
    CarasSaveResponse,
    CarasEnsayoDetail,
    CarasEnsayoSummary,
} from '@/types'

const API_URL = import.meta.env.VITE_API_URL || 'https://api.geofal.com.pe'

const api = axios.create({
    baseURL: API_URL,
})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            window.dispatchEvent(new CustomEvent('session-expired'))
        }
        return Promise.reject(error)
    },
)


const extractFilename = (contentDisposition?: string): string | undefined => {
    const match = typeof contentDisposition === 'string' ? contentDisposition.match(/filename="?([^";]+)"?/i) : null
    return match?.[1]
}

export async function saveCarasEnsayo(
    payload: CarasPayload,
    ensayoId?: number,
): Promise<CarasSaveResponse> {
    const { data } = await api.post<CarasSaveResponse>('/api/caras/excel', payload, {
        params: {
            download: false,
            ensayo_id: ensayoId,
        },
    })
    return data
}

export async function saveAndDownloadCarasExcel(
    payload: CarasPayload,
    ensayoId?: number,
): Promise<{ blob: Blob; ensayoId?: number; filename?: string }> {
    const response = await api.post('/api/caras/excel', payload, {
        params: {
            download: true,
            ensayo_id: ensayoId,
        },
        responseType: 'blob',
    })

    const ensayoIdHeader = response.headers['x-caras-id']
    const parsedId = Number(ensayoIdHeader)
    return {
        blob: response.data,
        ensayoId: Number.isFinite(parsedId) ? parsedId : undefined,
        filename: extractFilename(response.headers['content-disposition']),
    }
}

export async function listCarasEnsayos(limit = 100): Promise<CarasEnsayoSummary[]> {
    const { data } = await api.get<CarasEnsayoSummary[]>('/api/caras/', {
        params: { limit },
    })
    return data
}

export async function getCarasEnsayoDetail(ensayoId: number): Promise<CarasEnsayoDetail> {
    const { data } = await api.get<CarasEnsayoDetail>(`/api/caras/${ensayoId}`)
    return data
}

export default api
