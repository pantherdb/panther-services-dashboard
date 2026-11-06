import { Button } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { IconFileText, IconFlask, IconFolder, IconRefresh, IconUpload } from '@tabler/icons-react'
import clsx from 'clsx'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

import {
  useLoadSampleMutation,
  useReloadFolderMutation,
  useUploadFilesMutation,
} from '@/app/api/api'

const SKIP = /\.(png|jpe?g|gif|ico|zip|tar|tgz|pdf|exe|dll|so|db|sqlite)$/i

/** Whether a file from a picked folder is worth sending. Hidden files and obvious binaries aren't. */
function looksLikeLog(file: File): boolean {
  return !file.name.startsWith('.') && !SKIP.test(file.name)
}

type Props = { folder: string | null }

/**
 * Where logs come in: files or a folder sent to the backend, which parses and keeps them; or the
 * folder the backend was started on, read again; or the sample day. Local only, for now.
 */
export function FileIntake({ folder }: Props) {
  const folderRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [upload, uploading] = useUploadFilesMutation()
  const [loadSample, loadingSample] = useLoadSampleMutation()
  const [reload, reloading] = useReloadFolderMutation()

  // React has no prop for `webkitdirectory`; every current browser supports the attribute.
  useEffect(() => {
    folderRef.current?.setAttribute('webkitdirectory', '')
  }, [])

  const send = (files: File[], fromFolder: boolean) => {
    const wanted = fromFolder ? files.filter(looksLikeLog) : files
    if (!wanted.length) return
    upload(wanted)
      .unwrap()
      .catch(() =>
        notifications.show({
          color: 'red',
          title: 'Upload failed',
          message: 'The backend didn’t take the files. Is it running?',
        })
      )
  }

  const onPick = (fromFolder: boolean) => (event: ChangeEvent<HTMLInputElement>) => {
    send(Array.from(event.target.files ?? []), fromFolder)
    // The same file can be picked again after it's removed.
    event.target.value = ''
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    send(Array.from(event.dataTransfer.files), false)
  }

  return (
    <div
      onDragOver={event => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={clsx(
        'flex flex-col items-center justify-center gap-4 rounded-panel border-2 border-dashed px-6 py-8 text-center transition-colors',
        dragging ? 'border-accent bg-accent-wash' : 'border-hairline-strong bg-surface-1'
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-full bg-accent-wash text-accent"
      >
        <IconUpload size={22} stroke={1.75} />
      </span>
      <div>
        <p className="text-sm font-semibold text-ink">Drop exported logs here</p>
        <p className="mx-auto mt-1 max-w-prose text-xs text-ink-muted">
          The API&apos;s log, nginx&apos;s logs (
          <span className="sd-ident">docker compose logs</span> output too), Docker&apos;s events,{' '}
          <span className="sd-ident">docker inspect</span> and{' '}
          <span className="sd-ident">docker stats</span> output,{' '}
          <span className="sd-ident">.gz</span> included. They go to the dashboard&apos;s own
          backend on this machine, nowhere else.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          component="label"
          variant="filled"
          leftSection={<IconFileText size={14} />}
          loading={uploading.isLoading}
        >
          Choose files
          <input type="file" multiple className="sr-only" onChange={onPick(false)} />
        </Button>
        <Button
          component="label"
          leftSection={<IconFolder size={14} />}
          loading={uploading.isLoading}
        >
          Choose a folder
          <input ref={folderRef} type="file" multiple className="sr-only" onChange={onPick(true)} />
        </Button>
        {folder && (
          <Button
            leftSection={<IconRefresh size={14} />}
            loading={reloading.isLoading}
            onClick={() => void reload()}
          >
            Read the folder again
          </Button>
        )}
        <Button
          variant="subtle"
          leftSection={<IconFlask size={14} />}
          loading={loadingSample.isLoading}
          onClick={() => void loadSample()}
        >
          Load sample data
        </Button>
      </div>
      {folder && (
        <p className="text-2xs text-ink-faint">
          The backend reads <span className="sd-ident">{folder}</span> when it starts.
        </p>
      )}
    </div>
  )
}
