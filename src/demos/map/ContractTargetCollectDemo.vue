<script setup lang="ts">
/**
 * 门店合同目标收集 demo — FormTargetCollect 实例化验证（柜机协议）
 * 合同 schema（contractPhoto 1 个照片位）+ 门店清单。
 * 与手写版 ContractCollectionDemo（写死 49 家）不同：门店数据由宿主注入，可换接口/Excel。
 */
import { FormTargetCollect, contractCollectionSchema } from '@/components/form-builder'
import type { TargetItem } from '@/components/form-builder'

// 示例门店清单（真实业务由接口/Excel 提供，如合同 demo 的 49 家）
const targets: TargetItem[] = [
  {
    id: 7000000,
    name: '示例通讯汨罗市长乐镇01店',
    license: '示例通讯汨罗市长乐镇01店',
    address: '湖南省岳阳市汨罗市长乐镇示例路1号',
  },
  {
    id: 7000007,
    name: '示例通讯示例镇02店',
    license: '示例通讯示例镇02店',
    address: '湖南省岳阳市示例路2号',
  },
  {
    id: 7000014,
    name: '示例通讯岳阳县杨林街镇03店',
    license: '示例通讯岳阳县杨林街镇03店',
    address: '湖南省岳阳市岳阳县杨林街镇示例路3号',
  },
  {
    id: 7000021,
    name: '示例通讯湖南长沙宁乡04店',
    license: '示例通讯湖南长沙宁乡04店',
    address: '湖南长沙宁乡示例路4号',
  },
  {
    id: 7000028,
    name: '示例通讯平江县安定镇05店',
    license: '示例通讯平江县安定镇05店',
    address: '湖南省岳阳市平江县安定镇示例路5号',
  },
  {
    id: 7000035,
    name: '示例通讯岳阳县月田镇06店',
    license: '示例通讯岳阳县月田镇06店',
    address: '湖南省岳阳市岳阳县月田镇示例路6号',
  },
  {
    id: 7000042,
    name: '示例通讯耒阳市公平圩镇07店',
    license: '示例通讯耒阳市公平圩镇07店',
    address: '湖南省衡阳市耒阳市公平圩镇示例路7号',
  },
  {
    id: 7000049,
    name: '示例通讯宁乡08店',
    license: '示例通讯宁乡08店',
    address: '湖南省长沙市宁乡示例路8号',
  },
]
</script>

<template>
  <div class="demo">
    <h1 class="demo-title">门店合同收集（目标收集模式）</h1>
    <p class="demo-desc">
      FormTargetCollect 实例：合同 schema（柜机协议 1 个照片位）。 门店清单由宿主注入（此处示例 8 家，可换完整 49
      家或接口数据）。
    </p>
    <FormTargetCollect :schema="contractCollectionSchema()" :targets="targets" />
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
</style>
