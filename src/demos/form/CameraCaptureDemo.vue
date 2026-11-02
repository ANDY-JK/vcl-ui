<script setup lang="ts">
import { ref } from 'vue'
import CameraCapture from '@/components/form/CameraCapture.vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'

const showCamera = ref(false)
const capturedPhoto = ref<string | null>(null)
const photoList = ref<{ src: string; alt: string }[]>([])
const showPreview = ref(false)

function onCapture(file: File) {
  const url = URL.createObjectURL(file)
  capturedPhoto.value = url
  photoList.value = [{ src: url, alt: '拍照结果' }]
  showCamera.value = false
}

function onCameraError(msg: string) {
  console.warn('相机错误：', msg)
  showCamera.value = false
}

/* ══════ 多张连拍：拍完一张接着拍，胶卷回看/重拍某张，完成批量交付 ══════ */
const batchOpen = ref(false)
const batchPhotos = ref<File[]>([])
const batchUrls = ref<string[]>([])

function onBatchFinish(files: File[]) {
  batchUrls.value.forEach((u) => URL.revokeObjectURL(u))
  batchPhotos.value = files
  batchUrls.value = files.map((f) => URL.createObjectURL(f))
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">CameraCapture 页面内拍照</h1>
    <p class="demo-desc">
      替代系统相机调起，防止页面切后台被杀进程。支持前后置切换、4:3 高清、JPEG
      质量控制。相机不可用时自动降级调起系统相机。
    </p>

    <Card title="拍照演示" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(12px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Button text="打开相机" variant="primary" icon="camera" @click="showCamera = true" />
        <Button text="关闭相机" variant="ghost" :disabled="!showCamera" @click="showCamera = false" />
      </div>

      <!-- 拍照结果 -->
      <div v-if="capturedPhoto" style="margin-top: calc(16px * var(--vcl-scale))">
        <p
          style="
            font-size: calc(13px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(8px * var(--vcl-scale));
          "
        >
          拍照结果：
        </p>
        <img
          :src="capturedPhoto"
          alt="photo"
          style="
            max-width: calc(300px * var(--vcl-scale));
            border-radius: calc(8px * var(--vcl-scale));
            border: 1px solid var(--vcl-color-border);
          "
        />
        <div style="margin-top: calc(8px * var(--vcl-scale))">
          <Button text="预览照片" variant="outline" size="sm" @click="showPreview = true" />
          <ImagePreview v-if="showPreview" :src="capturedPhoto!" @close="showPreview = false" />
        </div>
      </div>
      <p
        v-else
        style="
          margin-top: calc(16px * var(--vcl-scale));
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        尚无拍照结果，点击「打开相机」拍照。
      </p>
    </Card>

    <!-- ══════ 多张连拍 ══════ -->
    <Card
      title="多张连拍 — 拍完一张接着拍，胶卷回看/重拍"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
    >
      <p class="demo-hint" style="margin-bottom: calc(12px * var(--vcl-scale))">
        <code>multiple</code> — 快门确认后不关相机，照片进队列继续拍下一张；顶部「完成(n)」交付，底部缩略图回看， 大图 ‹
        › 切换上一张/下一张，侧键「重拍」替换该张、「删除」移除。取消时已拍照片会先确认防误丢。<br />
        <code>shotNames</code> — 计划照片名称（按拍摄顺序对应），顶部提示当前要拍哪张、缩略图/回看显示名称，
        并写入交付文件名（如「现场全景-1730….jpg」）；未传自动「照片1、照片2…」。表单里 multiple
        上传字段的「拍照」入口即此模式（组件内已接通）。
      </p>
      <div style="display: flex; gap: calc(12px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Button text="打开连拍相机" variant="primary" icon="camera" @click="batchOpen = true" />
      </div>
      <div v-if="batchUrls.length" style="margin-top: calc(16px * var(--vcl-scale))">
        <p
          style="
            font-size: calc(13px * var(--vcl-scale));
            color: var(--vcl-color-text-muted);
            margin-bottom: calc(8px * var(--vcl-scale));
          "
        >
          连拍交付 {{ batchPhotos.length }} 张：
        </p>
        <div style="display: flex; gap: calc(8px * var(--vcl-scale)); flex-wrap: wrap">
          <img
            v-for="(u, i) in batchUrls"
            :key="u"
            :src="u"
            :alt="`shot-${i + 1}`"
            style="
              width: calc(96px * var(--vcl-scale));
              height: calc(72px * var(--vcl-scale));
              object-fit: cover;
              border-radius: calc(6px * var(--vcl-scale));
              border: 1px solid var(--vcl-color-border);
            "
          />
        </div>
      </div>
    </Card>

    <Card title="Props" title-as="h2">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">Prop</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">类型</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">默认</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>modelValue</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>显隐控制（v-model）</td>
          </tr>
          <tr>
            <td><code>quality</code></td>
            <td>number</td>
            <td>0.9</td>
            <td>JPEG 输出质量 0-1，默认 0.9</td>
          </tr>
          <tr>
            <td><code>fallbackOnError</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>页面内相机不可用（权限拒绝/无摄像头/非 HTTPS）时自动降级调起设备系统相机，默认 true</td>
          </tr>
          <tr>
            <td><code>multiple</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>
              多张连拍模式：快门确认后不交付、进内部队列并回到取景继续拍下一张；
              底部胶卷可回看/左右切换/重拍某张/删除，顶部「完成」经 finish 一次性交付 File[]。
              降级系统相机时无法连拍（每次一张，仍走 capture 事件逐张交付）。
            </td>
          </tr>
          <tr>
            <td><code>shotNames</code></td>
            <td>string[]</td>
            <td>() => []</td>
            <td>
              计划拍摄的照片名称（按拍摄顺序对应，如 ['门头照','铭牌特写']）。
              显示在顶部提示/胶卷/回看中，并写入交付文件名（name-时间戳.jpg）；未传则自动「照片1、照片2…」
            </td>
          </tr>
          <tr>
            <td><code>fallbackSheet</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>最后兜底：系统相机也拿不到照片（取消/不可用）时自动弹上传面板，默认 true</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table style="width: 100%; font-size: calc(13px * var(--vcl-scale)); border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--vcl-color-border); text-align: left">
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">事件</th>
            <th style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">参数</th>
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
              <code>capture</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              File
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              确认拍照，返回 File 对象
            </td>
          </tr>
          <tr>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              <code>cancel</code>
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              —
            </td>
            <td
              style="
                padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
                border-bottom: 1px solid var(--vcl-color-border-light);
              "
            >
              取消/关闭
            </td>
          </tr>
          <tr>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">
              <code>error</code>
            </td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">string</td>
            <td style="padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale))">相机不可用提示信息</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 相机组件 -->
    <CameraCapture v-model="showCamera" @capture="onCapture" @cancel="showCamera = false" @error="onCameraError" />
    <CameraCapture
      v-model="batchOpen"
      multiple
      :shot-names="['现场全景', '铭牌特写', '细节补充']"
      @finish="onBatchFinish"
      @cancel="batchOpen = false"
      @error="onCameraError"
    />
  </div>
</template>

<style scoped>
.demo-title {
  font-size: var(--vcl-fs-20);
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
