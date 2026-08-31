<script setup lang="ts">
/**
 * 返利函目标收集 demo — FormTargetCollect 实例化验证
 * 门店清单（示例）+ 返利函 schema（1 个照片位 rebatePhoto）
 * 数据形态与 ContractCollectionDemo 一致：目标表格 + 每行上传位 + 状态/搜索/导出。
 */
import { FormTargetCollect, rebateLetterSchema } from '@/components/form-builder'
import type { TargetItem } from '@/components/form-builder'

// 示例门店清单（复用合同收集同款结构；真实业务由接口/Excel 提供）
const targets: TargetItem[] = [
  {
    id: 3496644,
    name: '汇荣达汨罗市长乐镇姚献忠手机店',
    license: '汨罗市长乐镇姚献忠手机店',
    address: '湖南省岳阳市汨罗市长乐镇长新村6组24号',
  },
  {
    id: 3496654,
    name: '汇荣达岳阳市湘阴县文星镇新世界手机店',
    license: '湘阴县新世界手机城',
    address: '湖南省岳阳市湘阴县北正街新世界',
  },
  {
    id: 3577361,
    name: '汇荣达岳阳市岳阳县杨林街镇安泰通信店',
    license: '岳阳县安泰通信连锁杨林二店',
    address: '湖南省岳阳市岳阳县杨林街镇城山村',
  },
  {
    id: 3583293,
    name: '汇荣达宁乡市双江口镇宏音手机店',
    license: '宁乡县宏音手机店',
    address: '湖南长沙宁乡双江口镇新建街',
  },
  {
    id: 3594841,
    name: '汇荣达岳阳市平江县安定镇喜洋洋手机店',
    license: '平江县喜洋洋通信器材店',
    address: '湖南省岳阳市平江县安定镇喜洋洋手机店',
  },
  {
    id: 3594844,
    name: '汇荣达岳阳市岳阳县月田镇金巧巧手机店',
    license: '岳阳县金巧巧移动专营店',
    address: '湖南省岳阳市岳阳县月田镇金巧巧移动店',
  },
  {
    id: 3652441,
    name: '汇荣达耒阳市公平圩镇会军手机店',
    license: '耒阳市公平圩镇会军电信专营店',
    address: '湖南省衡阳市耒阳市公平圩镇站上中国电信',
  },
  {
    id: 3667942,
    name: '汇荣达宁乡市花明楼镇杨俊通讯店',
    license: '宁乡县花明楼镇杨俊通讯经营部',
    address: '湖南省长沙市宁乡市花明楼镇幸福大道',
  },
]
</script>

<template>
  <div class="demo">
    <h2 class="demo-title">返利函收集（目标收集模式）</h2>
    <p class="demo-desc">
      FormTargetCollect 实例：门店清单 + 返利函 schema（1 个照片位）。员工上门逐店上传，
      云端/本地聚合存储，按门店查看收集进度并导出 ZIP（按门店分目录 + 汇总表）。
    </p>
    <FormTargetCollect :schema="rebateLetterSchema()" :targets="targets" />
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
</style>
