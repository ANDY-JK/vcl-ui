<template>
  <div role="tablist">
    <button role="tab" :tabindex="active === 'a' ? 0 : -1">A</button>
    <button role="tab" tabindex="-1">B</button>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
const active = ref('a')
</script>
