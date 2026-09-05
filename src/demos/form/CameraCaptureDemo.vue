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
    <h2 class="demo-title">CameraCapture 页面内拍照</h2>
    <p class="demo-desc">
      替代系统相机调起，防止页面切后台被杀进程。支持前后置切换、4:3 高清、JPEG
      质量控制。相机不可用时自动降级调起系统相机。
    </p>

    <Card title="拍照演示" style="margin-bottom: 24px">
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
        <Button text="打开相机" variant="primary" icon="camera" @click="showCamera = true" />
        <Button text="关闭相机" variant="ghost" :disabled="!showCamera" @click="showCamera = false" />
      </div>

      <!-- 拍照结果 -->
      <div v-if="capturedPhoto" style="margin-top: 16px">
        <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 8px">拍照结果：</p>
        <img
          :src="capturedPhoto"
          alt="photo"
          style="max-width: 300px; border-radius: 8px; border: 1px solid var(--color-border)"
        />
        <div style="margin-top: 8px">
          <Button text="预览照片" variant="outline" size="sm" @click="showPreview = true" />
          <ImagePreview v-if="showPreview" :src="capturedPhoto!" @close="showPreview = false" />
        </div>
      </div>
      <p v-else style="margin-top: 16px; font-size: 13px; color: var(--color-text-muted)">
        尚无拍照结果，点击「打开相机」拍照。
      </p>
    </Card>

    <!-- ══════ 多张连拍 ══════ -->
    <Card title="多张连拍 — 拍完一张接着拍，胶卷回看/重拍" style="margin-bottom: 24px">
      <p class="demo-hint" style="margin-bottom: 12px">
        <code>multiple</code> — 快门确认后不关相机，照片进队列继续拍下一张；点底部缩略图回看， 大图 ‹ ›
        切换上一张/下一张，侧键「重拍」替换该张、「删除」移除；「完成(n)」一次性交付
        <code>finish</code> 事件（File[]）。取消时已拍照片会先确认防误丢。<br />
        表单里 multiple 上传字段的「拍照」入口即此模式（组件内已接通）。
      </p>
      <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
        <Button text="打开连拍相机" variant="primary" icon="camera" @click="batchOpen = true" />
      </div>
      <div v-if="batchUrls.length" style="margin-top: 16px">
        <p style="font-size: 13px; color: var(--color-text-muted); margin-bottom: 8px">
          连拍交付 {{ batchPhotos.length }} 张：
        </p>
        <div style="display: flex; gap: 8px; flex-wrap: wrap">
          <img
            v-for="(u, i) in batchUrls"
            :key="u"
            :src="u"
            :alt="`shot-${i + 1}`"
            style="
              width: 96px;
              height: 72px;
              object-fit: cover;
              border-radius: 6px;
              border: 1px solid var(--color-border);
            "
          />
        </div>
      </div>
    </Card>

    <Card title="Props">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">Prop</th>
            <th style="padding: 6px 8px">类型</th>
            <th style="padding: 6px 8px">默认</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>modelValue</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">boolean</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">false</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">v-model 控制显隐</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>quality</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">number</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">0.9</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">JPEG 输出质量 0-1</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>fallbackOnError</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">boolean</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">true</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              相机不可用时降级调起系统相机
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 8px">
              <code>multiple</code>
            </td>
            <td style="padding: 6px 8px">boolean</td>
            <td style="padding: 6px 8px">false</td>
            <td style="padding: 6px 8px">多张连拍：胶卷回看/重拍某张，完成时 finish 交付 File[]</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Events" style="margin-top: 24px">
      <table style="width: 100%; font-size: 13px; border-collapse: collapse">
        <thead>
          <tr style="border-bottom: 2px solid var(--color-border); text-align: left">
            <th style="padding: 6px 8px">事件</th>
            <th style="padding: 6px 8px">参数</th>
            <th style="padding: 6px 8px">说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>capture</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">File</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              确认拍照，返回 File 对象
            </td>
          </tr>
          <tr>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">
              <code>cancel</code>
            </td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">—</td>
            <td style="padding: 6px 8px; border-bottom: 1px solid var(--color-border-light)">取消/关闭</td>
          </tr>
          <tr>
            <td style="padding: 6px 8px">
              <code>error</code>
            </td>
            <td style="padding: 6px 8px">string</td>
            <td style="padding: 6px 8px">相机不可用提示信息</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 相机组件 -->
    <CameraCapture v-model="showCamera" @capture="onCapture" @cancel="showCamera = false" @error="onCameraError" />
    <CameraCapture
      v-model="batchOpen"
      multiple
      @finish="onBatchFinish"
      @cancel="batchOpen = false"
      @error="onCameraError"
    />
  </div>
</template>

<style scoped>
.demo-title {
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 4px;
}
.demo-desc {
  color: var(--color-text-muted);
  margin-bottom: 24px;
  font-size: 14px;
  line-height: 1.6;
}
code {
  background: var(--color-bg-alt);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 12px;
}
</style>
