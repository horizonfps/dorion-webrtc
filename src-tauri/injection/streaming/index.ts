import { StreamController } from './controller'

export function initStreaming() {
  const controller = new StreamController()
  window.Dorion.streaming = controller
  void controller.initialize()
}

