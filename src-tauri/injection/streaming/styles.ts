export const streamingStyles = `
#dorion-stream-root {
  --ds-accent: #5865f2;
  --ds-danger: #da373c;
  --ds-panel: #111214;
  --ds-panel-raised: #1e1f22;
  --ds-text: #f2f3f5;
  --ds-muted: #b5bac1;
  color: var(--ds-text);
  font-family: gg sans, Whitney, Helvetica Neue, Helvetica, Arial, sans-serif;
  position: fixed;
  z-index: 10000;
}

#dorion-stream-control {
  align-items: center;
  background: var(--ds-panel-raised);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 12px;
  bottom: 16px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 36%);
  display: flex;
  gap: 6px;
  padding: 6px;
  position: fixed;
  right: 18px;
}

.dorion-stream-action,
.dorion-stream-icon-button,
.dorion-stream-audio-button {
  align-items: center;
  border: 0;
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  justify-content: center;
}

.dorion-stream-action {
  background: var(--ds-accent);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  gap: 8px;
  min-height: 36px;
  padding: 0 14px;
}

.dorion-stream-action[data-sharing='true'] {
  background: var(--ds-danger);
}

.dorion-stream-action:disabled {
  background: #4e5058;
  color: #949ba4;
  cursor: not-allowed;
}

.dorion-stream-icon-button {
  background: transparent;
  border-radius: 8px;
  color: var(--ds-muted);
  font-size: 19px;
  height: 36px;
  width: 36px;
}

.dorion-stream-icon-button:hover {
  background: rgb(255 255 255 / 8%);
  color: var(--ds-text);
}

#dorion-stream-status {
  color: var(--ds-muted);
  font-size: 11px;
  max-width: 180px;
  overflow: hidden;
  padding: 0 5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

#dorion-stream-viewers {
  background: var(--ds-panel);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 12px;
  bottom: 68px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 42%);
  display: none;
  max-width: min(780px, calc(100vw - 36px));
  overflow: hidden;
  position: fixed;
  right: 18px;
}

#dorion-stream-viewers[data-visible='true'] {
  display: block;
}

.dorion-stream-viewers-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding: 11px 13px;
}

.dorion-stream-viewers-title {
  font-size: 13px;
  font-weight: 700;
}

.dorion-stream-live {
  background: var(--ds-danger);
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .04em;
  margin-right: 7px;
  padding: 3px 5px;
}

#dorion-stream-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(260px, 1fr));
  max-height: min(68vh, 620px);
  overflow: auto;
  padding: 0 8px 8px;
}

.dorion-stream-tile {
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: 8px;
  min-width: 260px;
  overflow: hidden;
  position: relative;
}

.dorion-stream-tile video {
  height: 100%;
  object-fit: contain;
  width: 100%;
}

.dorion-stream-tile-info {
  align-items: center;
  background: linear-gradient(transparent, rgb(0 0 0 / 78%));
  bottom: 0;
  display: flex;
  font-size: 12px;
  font-weight: 600;
  justify-content: space-between;
  left: 0;
  padding: 26px 9px 8px;
  pointer-events: none;
  position: absolute;
  right: 0;
}

.dorion-stream-fullscreen {
  background: rgb(0 0 0 / 58%);
  border: 0;
  border-radius: 5px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  height: 28px;
  pointer-events: auto;
  width: 32px;
}

#dorion-stream-audio {
  bottom: 76px;
  display: none;
  position: fixed;
  right: 26px;
}

#dorion-stream-audio[data-visible='true'] {
  display: block;
}

.dorion-stream-audio-button {
  background: var(--ds-accent);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(0 0 0 / 36%);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  min-height: 36px;
  padding: 0 13px;
}

#dorion-stream-settings {
  background: var(--ds-panel-raised);
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 12px;
  bottom: 68px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 42%);
  display: none;
  padding: 16px;
  position: fixed;
  right: 18px;
  width: min(380px, calc(100vw - 36px));
}

#dorion-stream-settings[data-visible='true'] {
  display: block;
}

.dorion-stream-settings-title {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 14px;
}

.dorion-stream-field {
  color: var(--ds-muted);
  display: block;
  font-size: 11px;
  font-weight: 700;
  margin: 12px 0 5px;
  text-transform: uppercase;
}

.dorion-stream-input {
  background: #111214;
  border: 1px solid transparent;
  border-radius: 4px;
  box-sizing: border-box;
  color: var(--ds-text);
  font: inherit;
  font-size: 14px;
  outline: 0;
  padding: 10px;
  width: 100%;
}

.dorion-stream-input:focus {
  border-color: var(--ds-accent);
}

.dorion-stream-toggle-row {
  align-items: center;
  display: flex;
  font-size: 13px;
  gap: 8px;
  margin-top: 12px;
}

.dorion-stream-settings-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}

.dorion-stream-secondary {
  background: transparent;
  border: 0;
  color: var(--ds-muted);
  cursor: pointer;
  font: inherit;
  padding: 8px 10px;
}

.dorion-stream-error {
  color: #fa777c;
  font-size: 12px;
  line-height: 1.4;
  margin-top: 10px;
}

@media (max-width: 650px) {
  #dorion-stream-grid {
    grid-template-columns: minmax(250px, 1fr);
  }
}
`

