import * as React from "react"
import type { ToastProps, ToastActionElement } from "@/components/ui/toast"

const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 4000

type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

let count = 0
function genId() { return (++count).toString() }

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string }

interface State { toasts: ToasterToast[] }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
let listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((l) => l(memoryState))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST":
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case "DISMISS_TOAST": {
      const { toastId } = action
      if (toastId) addToRemoveQueue(toastId)
      else state.toasts.forEach((t) => addToRemoveQueue(t.id))
      return { toasts: state.toasts.map((t) => t.id === toastId || !toastId ? { ...t, open: false } : t) }
    }
    case "REMOVE_TOAST":
      return { toasts: action.toastId ? state.toasts.filter((t) => t.id !== action.toastId) : [] }
  }
}

function addToRemoveQueue(id: string) {
  if (toastTimeouts.has(id)) return
  const timeout = setTimeout(() => { toastTimeouts.delete(id); dispatch({ type: "REMOVE_TOAST", toastId: id }) }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(id, timeout)
}

function toast({ ...props }: Omit<ToasterToast, "id">) {
  const id = genId()
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })
  dispatch({ type: "ADD_TOAST", toast: { ...props, id, open: true, onOpenChange: (o) => { if (!o) dismiss() } } })
  return { id, dismiss }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { listeners = listeners.filter((l) => l !== setState) }
  }, [])
  return { ...state, toast, dismiss: (id?: string) => dispatch({ type: "DISMISS_TOAST", toastId: id }) }
}

export { useToast, toast }
