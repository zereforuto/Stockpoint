import { useMemo } from 'react'
import { call } from '../api/client'
import { Modal } from './ui/Modal'
import { buildReceiptHtml } from '@shared/receipt'
import { allowedChannels } from '@shared/ipc'
import type { SaleDetail, Settings } from '@shared/types'
import { useSession } from '../stores/session'
import { useToasts } from '../stores/toast'

export interface ReceiptModalProps {
  sale: SaleDetail
  settings: Settings
  onClose: () => void
}

/**
 * On-screen receipt preview (same HTML the printer receives) plus print and
 * save-as-PDF actions. Cashiers can print; saving a file is owner-only.
 */
export function ReceiptModal({ sale, settings, onClose }: ReceiptModalProps) {
  const role = useSession((state) => state.user?.role ?? null)
  const push = useToasts((state) => state.push)
  const pushError = useToasts((state) => state.pushError)
  const canSaveFile = allowedChannels(role).has('dialog:saveFile')

  const html = useMemo(() => buildReceiptHtml(settings, sale), [settings, sale])

  const print = async (): Promise<void> => {
    try {
      await call('print:receipt', { saleId: sale.id })
      push('info', 'Receipt sent to the printer')
    } catch (error) {
      pushError(error)
    }
  }

  const savePdf = async (): Promise<void> => {
    try {
      const picked = await call('dialog:saveFile', {
        defaultName: sale.receiptNo,
        filters: [{ name: 'PDF document', extensions: ['pdf'] }]
      })
      if (!picked.path) return
      await call('print:receipt', { saleId: sale.id, filePath: picked.path })
      push('success', `Saved to ${picked.path}`)
    } catch (error) {
      pushError(error)
    }
  }

  return (
    <Modal
      open
      title={`Receipt ${sale.receiptNo}`}
      onClose={onClose}
      wide
      footer={
        <>
          {canSaveFile ? (
            <button type="button" className="btn-secondary" onClick={() => void savePdf()}>
              Save as PDF
            </button>
          ) : null}
          <button type="button" className="btn-secondary" onClick={() => void print()}>
            Print
          </button>
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </>
      }
    >
      <div className="h-[65vh] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <iframe className="receipt-frame" srcDoc={html} title="Receipt preview" />
      </div>
    </Modal>
  )
}
