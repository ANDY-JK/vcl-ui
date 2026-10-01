<script setup lang="ts">
import { ref } from 'vue'
import Image from '@/components/data/Image.vue'
import ImagePreview from '@/components/data/ImagePreview.vue'
import Avatar from '@/components/data/Avatar.vue'
import Button from '@/components/basic/Button.vue'
import Card from '@/components/data/Card.vue'
import { demoPhoto, demoBrokenUrl, demoWide, demoTall, demoLarge, demoMulti, demoAvatars } from '@/demos/demo-images'

// ---- Image 基础 ----（图片全部是本地内联 SVG，见 demo-images.ts 说明）
const demoImages = {
  valid: demoPhoto,
  broken: demoBrokenUrl,
}

// ---- Avatar ----
const photoUrl = demoAvatars[0]

// ---- ImagePreview 单图 ----
const singleVisible = ref(false)
const singleSrc = ref('')

// ---- ImagePreview 多图 ----
const multiVisible = ref(false)
const multiImages = demoMulti
const multiStartIdx = ref(0)

function openSingle(url: string) {
  singleSrc.value = url
  singleVisible.value = true
}
function openMulti(idx: number) {
  multiStartIdx.value = idx
  multiVisible.value = true
}
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">Image 图片</h1>
    <p class="demo-desc">
      图片展示（懒加载 / 加载占位 / 失败兜底）、头像模式（Avatar）、全屏预览（缩放 / 旋转 / 标注 / 多图切换 / 导出）。
    </p>

    <!-- ══════════════ Image 基础 ══════════════ -->
    <Card title="基本用法" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: flex-end; flex-wrap: wrap">
        <div style="text-align: center">
          <Image :src="demoImages.valid" :size="60" alt="示例" />
          <p class="cap">size=60</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :size="100" alt="示例" />
          <p class="cap">size=100</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="160" :height="100" alt="示例" />
          <p class="cap">width=160 height=100</p>
        </div>
      </div>
    </Card>

    <Card title="圆角 & 圆形" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: flex-end; flex-wrap: wrap">
        <div style="text-align: center">
          <Image :src="demoImages.valid" :size="80" :radius="4" alt="默认圆角" />
          <p class="cap">radius=4（默认）</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :size="80" :radius="16" alt="大圆角" />
          <p class="cap">radius=16</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :size="80" round alt="圆形" />
          <p class="cap">round</p>
        </div>
      </div>
    </Card>

    <Card title="Object-Fit 模式" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: flex-end; flex-wrap: wrap">
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="140" :height="80" fit="cover" alt="cover" />
          <p class="cap">cover（默认）</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="140" :height="80" fit="contain" alt="contain" />
          <p class="cap">contain</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="140" :height="80" fit="fill" alt="fill" />
          <p class="cap">fill</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="140" :height="80" fit="scale-down" alt="scale-down" />
          <p class="cap">scale-down</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.valid" :width="140" :height="80" fit="none" alt="none" />
          <p class="cap">none（不缩放，居中裁切）</p>
        </div>
      </div>
    </Card>

    <Card title="灯箱预览（点击放大）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <p
        style="
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(12px * var(--vcl-scale));
        "
      >
        默认 preview=true，点击图片可全屏预览。按 ESC 或点击遮罩关闭。多图画廊、标注、下载等高级能力见下方
        ImagePreview。
      </p>
      <Image :src="demoImages.valid" :size="120" alt="点击预览" />
    </Card>

    <Card title="加载失败状态" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: flex-end; flex-wrap: wrap">
        <div style="text-align: center">
          <Image :src="demoImages.broken" :size="80" alt="加载失败" />
          <p class="cap">默认提示</p>
        </div>
        <div style="text-align: center">
          <Image :src="demoImages.broken" :size="80" error-text="图片不见了" alt="自定义错误" />
          <p class="cap">自定义文案</p>
        </div>
      </div>
    </Card>

    <!-- ══════════════ Avatar 头像 ══════════════ -->
    <Card title="Avatar 头像 — 尺寸（圆形）" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Avatar :src="photoUrl" size="sm" name="小" />
        <Avatar :src="photoUrl" size="md" name="中" />
        <Avatar :src="photoUrl" size="lg" name="大" />
        <Avatar :src="photoUrl" size="xl" name="超大" />
      </div>
    </Card>

    <Card title="Avatar 头像 — 形状对比" title-as="h2" style="margin-bottom: calc(24px * var(--vcl-scale))">
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Avatar :src="photoUrl" size="lg" shape="circle" name="圆形" />
        <Avatar :src="photoUrl" size="lg" shape="rounded" name="圆角" />
      </div>
    </Card>

    <Card
      title="Avatar 头像 — 回退策略（图片失败→文字首字母）"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
    >
      <div style="display: flex; gap: calc(16px * var(--vcl-scale)); align-items: center; flex-wrap: wrap">
        <Avatar src="invalid-url" size="lg" name="张三" />
        <Avatar size="lg" name="李四" />
        <Avatar size="lg" name="王五六" />
        <Avatar size="md" name="Alice Smith" />
      </div>
      <p
        style="
          margin-top: calc(8px * var(--vcl-scale));
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
        "
      >
        无 src 或 src 加载失败时，取 name 前两个单词首字母大写
      </p>
    </Card>

    <!-- ══════════════ ImagePreview 全屏预览 ══════════════ -->
    <Card
      title="ImagePreview 全屏预览 — 单图模式（:src）"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
    >
      <div style="display: flex; gap: calc(10px * var(--vcl-scale)); flex-wrap: wrap">
        <Button text="宽图" variant="secondary" @click="openSingle(demoWide)" />
        <Button text="长图" variant="secondary" @click="openSingle(demoTall)" />
        <Button text="大图" variant="secondary" @click="openSingle(demoLarge)" />
      </div>
    </Card>

    <Card
      title="ImagePreview 全屏预览 — 多图模式（:src 数组）"
      title-as="h2"
      style="margin-bottom: calc(24px * var(--vcl-scale))"
    >
      <p
        style="
          font-size: calc(13px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-bottom: calc(10px * var(--vcl-scale));
        "
      >
        支持<strong>缩放拖拽</strong>（滚轮 / 双指缩放 / 双击）、<strong>旋转翻转</strong>、<strong>标注</strong>（矩形
        / 圆形 / 画笔，R / C / P 快捷键）、<strong>下载 / 复制</strong
        >（含标注合成图）、<strong>缩略图侧边栏</strong>、左右箭头 / 键盘 ← → / 触摸滑动。
      </p>
      <div style="display: flex; gap: calc(10px * var(--vcl-scale)); flex-wrap: wrap">
        <Button v-for="(img, i) in multiImages" :key="i" :text="img.label!" variant="secondary" @click="openMulti(i)" />
      </div>
    </Card>

    <!-- ══════════════ Props 表 ══════════════ -->
    <Card title="Image Props" title-as="h2">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>src</code></td>
            <td>string</td>
            <td>—</td>
            <td>图片地址</td>
          </tr>
          <tr>
            <td><code>width / height</code></td>
            <td>number</td>
            <td>—</td>
            <td>宽高（px）</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>number</td>
            <td>80</td>
            <td>默认宽高（px）</td>
          </tr>
          <tr>
            <td><code>fit</code></td>
            <td>string</td>
            <td>'cover'</td>
            <td>object-fit</td>
          </tr>
          <tr>
            <td><code>radius</code></td>
            <td>number</td>
            <td>4</td>
            <td>圆角（px）</td>
          </tr>
          <tr>
            <td><code>round</code></td>
            <td>boolean</td>
            <td>false</td>
            <td>圆形</td>
          </tr>
          <tr>
            <td><code>lazy</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>懒加载</td>
          </tr>
          <tr>
            <td><code>preview</code></td>
            <td>boolean</td>
            <td>true</td>
            <td>点击灯箱预览</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="Avatar Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>src</code></td>
            <td>string</td>
            <td>—</td>
            <td>头像图片地址</td>
          </tr>
          <tr>
            <td><code>name</code></td>
            <td>string</td>
            <td>—</td>
            <td>姓名（失败时取首字母）</td>
          </tr>
          <tr>
            <td><code>size</code></td>
            <td>'sm' | 'md' | 'lg' | 'xl'</td>
            <td>'md'</td>
            <td>尺寸 32/40/56/72px</td>
          </tr>
          <tr>
            <td><code>shape</code></td>
            <td>'circle' | 'rounded'</td>
            <td>'circle'</td>
            <td>形状</td>
          </tr>
        </tbody>
      </table>
    </Card>

    <Card title="ImagePreview Props" title-as="h2" style="margin-top: calc(24px * var(--vcl-scale))">
      <table class="props-table">
        <thead>
          <tr>
            <th>Prop</th>
            <th>类型</th>
            <th>默认</th>
            <th>说明</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>src</code></td>
            <td>string | ImageItem | array</td>
            <td>—</td>
            <td>图片源（单图/多图）</td>
          </tr>
          <tr>
            <td><code>initialIndex</code></td>
            <td>number</td>
            <td>0</td>
            <td>多图初始索引</td>
          </tr>
          <tr>
            <td><code>title</code></td>
            <td>string</td>
            <td>—</td>
            <td>标题</td>
          </tr>
        </tbody>
      </table>
      <p
        style="
          font-size: calc(12px * var(--vcl-scale));
          color: var(--vcl-color-text-muted);
          margin-top: calc(8px * var(--vcl-scale));
        "
      >
        Events: <code>@close</code> | <code>@change</code>（多图切换）
      </p>
    </Card>

    <!-- ImagePreview 实例 -->
    <ImagePreview v-if="singleVisible" :src="singleSrc" @close="singleVisible = false" />
    <ImagePreview v-if="multiVisible" :src="multiImages" :initial-index="multiStartIdx" @close="multiVisible = false" />
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
}
.cap {
  font-size: calc(11px * var(--vcl-scale));
  color: var(--vcl-color-text-muted);
  margin-top: calc(4px * var(--vcl-scale));
}
code {
  background: var(--vcl-color-bg-alt);
  padding: 1px calc(5px * var(--vcl-scale));
  border-radius: calc(3px * var(--vcl-scale));
  font-size: calc(12px * var(--vcl-scale));
}
.props-table {
  width: 100%;
  font-size: calc(13px * var(--vcl-scale));
  border-collapse: collapse;
}
.props-table th {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 2px solid var(--vcl-color-border);
  text-align: left;
}
.props-table td {
  padding: calc(6px * var(--vcl-scale)) calc(8px * var(--vcl-scale));
  border-bottom: 1px solid var(--vcl-color-border-light);
}
</style>
