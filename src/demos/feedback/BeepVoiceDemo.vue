<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { beepSuccess, beepError, beepNotify, unlockAudio, notify, getNotifyStatus } from '@/components'
import { speak, stopSpeak, unlockVoice } from '@/components'
import type { VoiceLang } from '@/components'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'
import Toast from '@/components/feedback/Toast.vue'

const toastRef = ref<InstanceType<typeof Toast> | null>(null)

const audioUnlocked = ref(false)
const voiceUnlocked = ref(false)
const speaking = ref(false)
const log = ref<string[]>([])
const notifyPerm = ref(getNotifyStatus())
let speakTimer: ReturnType<typeof setInterval> | undefined

function addLog(msg: string) {
  log.value.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`)
  if (log.value.length > 10) log.value.pop()
}

function doUnlockAudio() {
  unlockAudio()
  audioUnlocked.value = true
  addLog('蜂鸣音 AudioContext 已解锁')
}

function doUnlockVoice() {
  unlockVoice()
  voiceUnlocked.value = true
  addLog('语音播报 SpeechSynthesis 已解锁')
}

function doBeep(type: 'success' | 'error' | 'notify') {
  if (!audioUnlocked.value) doUnlockAudio()
  if (type === 'success') beepSuccess()
  if (type === 'error') beepError()
  if (type === 'notify') beepNotify()
  addLog(`蜂鸣音：${type}`)
}

function doSpeak(text: string, rate = 1, pitch = 1, lang: VoiceLang = 'zh') {
  if (!voiceUnlocked.value) doUnlockVoice()
  speaking.value = true
  addLog(`播报：${text}（rate=${rate} pitch=${pitch} lang=${lang}）`)
  try {
    speak(text, rate, pitch, lang)
  } catch {
    speaking.value = false
    addLog('播报失败：语音引擎不可用')
    return
  }
  // voices 未就绪时 speak 会把请求挂起补发，此时 speaking/pending 仍为 false —— 只认它自己报的忙标志
  watchSynthBusy()
}

/** 轮询 speechSynthesis 的真实忙标志判定播完；speak() 没有完成回调（签名止于 lang） */
function watchSynthBusy() {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    speaking.value = false
    addLog('本机无 SpeechSynthesis，无法判定播报状态')
    return
  }
  const started = Date.now()
  let sawBusy = false
  stopWatch()
  speakTimer = setInterval(() => {
    const busy = speechSynthesis.speaking || speechSynthesis.pending
    if (busy) sawBusy = true
    if (!busy && (sawBusy || Date.now() - started > 5000)) {
      stopWatch()
      speaking.value = false
      addLog(sawBusy ? '播报结束（语音引擎报闲）' : '播报未启动（语音引擎始终空闲）')
    }
  }, 200)
}

function stopWatch() {
  if (speakTimer) {
    clearInterval(speakTimer)
    speakTimer = undefined
  }
}

onUnmounted(stopWatch)

function doStopSpeak() {
  stopSpeak()
  stopWatch()
  speaking.value = false
  addLog('停止播报')
}

// ---- 系统通知 ----
async function doNotify(
  title: string,
  bodyOrOptions?: string | { body?: string; url?: string; autoClose?: number; onClick?: () => void },
) {
  await notify(title, bodyOrOptions ?? '')
  notifyPerm.value = getNotifyStatus()
  addLog(`系统通知：${title}`)
}

function doNotifyUrl() {
  doNotify('打开百度', { body: '点击跳转', url: 'https://www.baidu.com', autoClose: 5000 })
}

function doNotifyClick() {
  doNotify('点击测试', { body: '点击通知看效果', onClick: () => toastRef.value?.show('通知被点击了！') })
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">通知反馈（蜂鸣 + 语音 + 系统通知）</h1>
    <p class="demo-desc">
      蜂鸣音（操作反馈音效）、语音播报（TTS 朗读文字）、系统通知（Windows/macOS
      通知中心）。浏览器要求用户交互后才能播放音频。
    </p>

    <Card title="蜂鸣音（Beep）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        ⚠️ 浏览器限制：首次播放前需用户交互。点击「解锁音频」按钮后才能播放。
      </p>
      <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap">
        <Button
          text="解锁音频"
          variant="ghost"
          size="sm"
          icon="volume-2"
          :disabled="audioUnlocked"
          @click="doUnlockAudio"
        />
        <Button text="成功音" variant="primary" size="sm" @click="doBeep('success')" />
        <Button text="错误音" variant="danger" size="sm" @click="doBeep('error')" />
        <Button text="通知音" variant="secondary" size="sm" @click="doBeep('notify')" />
      </div>
    </Card>

    <Card title="语音播报（Voice / TTS）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div
        style="
          display: flex;
          gap: calc(8px * var(--vcl-scale));
          flex-wrap: wrap;
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        <Button
          text="解锁语音"
          variant="ghost"
          size="sm"
          icon="megaphone"
          :disabled="voiceUnlocked"
          @click="doUnlockVoice"
        />
        <Button text="播报：操作成功" variant="primary" size="sm" :disabled="speaking" @click="doSpeak('操作成功')" />
        <Button
          text="播报：请注意"
          variant="secondary"
          size="sm"
          :disabled="speaking"
          @click="doSpeak('请注意，有新订单到达')"
        />
        <Button
          text="播报：错误"
          variant="danger"
          size="sm"
          :disabled="speaking"
          @click="doSpeak('操作失败，请重试')"
        />
        <Button
          text="慢速英文播报"
          variant="secondary"
          size="sm"
          :disabled="speaking"
          @click="doSpeak('Order received', 0.7, 1.2, 'en')"
        />
        <Button text="停止" variant="outline" size="sm" :disabled="!speaking" @click="doStopSpeak" />
      </div>
    </Card>

    <Card title="系统通知（Notify）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        Windows / macOS 通知中心。首次调用 notify() 会弹权限请求，授权后永久生效。当前权限：<code>{{
          notifyPerm
        }}</code>
      </p>
      <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap">
        <Button
          text="基础通知"
          variant="primary"
          size="sm"
          icon="bell-ring"
          @click="doNotify('扫码成功', 'S12345678901')"
        />
        <Button text="带 URL 通知" variant="secondary" size="sm" @click="doNotifyUrl" />
        <Button text="点击回调通知" variant="outline" size="sm" @click="doNotifyClick" />
      </div>
    </Card>

    <Card title="操作日志" title-as="h2">
      <div v-if="log.length" style="font-size: calc(13px * var(--vcl-scale)); font-family: monospace; line-height: 1.8">
        <div v-for="(item, i) in log" :key="i" style="color: var(--vcl-color-text-muted)">
          {{ item }}
        </div>
      </div>
      <p v-else style="font-size: calc(13px * var(--vcl-scale)); color: var(--vcl-color-text-muted)">暂无操作记录</p>
    </Card>

    <Card title="API" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">函数</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">来源</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>unlockAudio()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useBeep
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              解锁 AudioContext
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>beepSuccess()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useBeep
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              成功提示音
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>beepError()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useBeep
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              错误提示音
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>beepNotify()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useBeep
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              通知提示音
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>unlockVoice()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useVoice
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              解锁 SpeechSynthesis
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>speak(text, rate?, pitch?, lang?)</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useVoice
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              朗读文字；rate 0.1~10、pitch 0~2、lang 指定语言（'auto' 自动检测）。无完成回调，播放状态见下方按钮
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>stopSpeak()</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useVoice
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              停止播报
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>notify(title, bodyOrOptions?)</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              useNotify
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              发送系统通知，首次自动请求权限。支持 <code>{ body, url, autoClose, onClick }</code>
            </td>
          </tr>
          <tr>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>getNotifyStatus()</code>
            </td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">useNotify</td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              返回 'granted' | 'denied' | 'prompt' | 'unsupported'
            </td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Toast ref="toastRef" position="bottom-right" />
  </div>
</template>

<style scoped>
.demo-title {
  font-size: calc(22px * var(--vcl-scale));
  font-weight: 700;
  margin-bottom: calc(4px * var(--vcl-scale));
}
.demo-desc {
  color: var(--vcl-color-text-muted);
  margin-bottom: calc(24px * var(--vcl-scale));
  font-size: calc(14px * var(--vcl-scale));
  line-height: 1.6;
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
</style>
