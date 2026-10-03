import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiFailure, requestOcr } from '@/lib/api'
import { localError } from '@/lib/errors'
import type { ApiError, OcrResult } from '@/lib/types'

/** A picture in the composer: being read, read, or not readable. */
export interface ImageReading {
  file: File
  /** A local object URL for the thumbnail. It is revoked when the picture leaves the composer. */
  preview: string
  status: 'reading' | 'read' | 'failed'
  result: OcrResult | null
}

/**
 * F1: a picture is never verified directly. It is read (`POST /api/ocr`), its text is handed to
 * the composer's field for the user to check and edit, and only then verified, as text.
 */
export function useImageReader({
  maxMb,
  onRead,
  onError,
}: {
  maxMb: number
  onRead: (result: OcrResult) => void
  onError: (error: ApiError) => void
}) {
  const [image, setImage] = useState<ImageReading | null>(null)
  const controller = useRef<AbortController | null>(null)
  const preview = useRef<string | null>(null)

  /** Stop a reading in flight and let go of the thumbnail. */
  const release = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    if (preview.current) URL.revokeObjectURL(preview.current)
    preview.current = null
  }, [])

  useEffect(() => release, [release])

  const read = useCallback(
    async (file: File) => {
      release()
      const url = URL.createObjectURL(file)
      preview.current = url
      if (file.size > maxMb * 1024 * 1024) {
        setImage({ file, preview: url, status: 'failed', result: null })
        onError(localError('image_too_large'))
        return
      }
      const current = new AbortController()
      controller.current = current
      setImage({ file, preview: url, status: 'reading', result: null })
      try {
        const result = await requestOcr(file, current.signal)
        if (current.signal.aborted) return
        setImage({ file, preview: url, status: 'read', result })
        onRead(result)
      } catch (cause) {
        if (current.signal.aborted) return
        setImage({ file, preview: url, status: 'failed', result: null })
        onError(cause instanceof ApiFailure ? cause.error : localError('internal'))
      }
    },
    [maxMb, onError, onRead, release],
  )

  /** Take the picture out of the composer. The text it gave stays in the field. */
  const remove = useCallback(() => {
    release()
    setImage(null)
  }, [release])

  return { image, read, remove }
}
