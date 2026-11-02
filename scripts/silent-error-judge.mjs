/**
 * 「错误状态写了却没人看」判据的**纯函数版**（#372，从 tests 里抽出）
 *
 * ## 原判据的已知漏洞（TD-26）
 *
 * 原实现只问一句：**这个名字在 `<template>` 里出现过吗**。
 * 于是下面三种"用户其实看不见"的写法全都能绕过棘轮：
 *
 *   · `<p v-if="false">{{ importError }}</p>`      —— 常量假条件，永远不渲染
 *   · `<p v-show="false">{{ importError }}</p>`     —— v-show 假，display:none
 *   · `<!-- {{ importError }} -->`                  —— 注释里
 *
 * 棘轮的语义是「用户能否看到这条错误」，**"出现过"不等于"看得见"**。
 * 加了两道过滤：① 去注释；② 跳过被常量假指令包裹的子树。
 *
 * ## 为什么还是启发式
 *
 * 真正的可见性要跑渲染（jsdom 里 `display:none`、条件编译、动态指令…），
 * 而这是**静态棘轮**，成本得压在一秒内。所以只处理三类最常见的"常量假"：
 * `v-if` / `v-show` / `v-else-if` 取 `false|0|'false'`。
 * 动态条件（`v-if="loading"`）**不判**：那是业务逻辑，静态判不了，也不该判。
 *
 * 宁可漏（动态条件不判）也不误报 —— 误报会让人开始往清单里堆豁免，棘轮就废了。
 */

/** 名字像"错误/提示"的状态 */
export const STATE_NAME = /(Error|Msg|Message|Fail|Failure|Warn|Warning|Alert|Hint)$/

/** 常量假：v-if="false" / v-show="0" / v-else-if="'false'" */
const CONST_FALSE_DIRECTIVE = /\bv-(?:if|else-if|show)\s*=\s*["']\s*(?:false|0|'false'|"false")\s*["']/i

/** 去掉 HTML 注释（注释里的名字不算"用户看得到"） */
function stripComments(template) {
  return template.replace(/<!--[\s\S]*?-->/g, '')
}

/**
 * 把「被常量假指令包裹的子树」替换成空串。
 *
 * 做法：按标签扫一遍，遇到常量假开标签 → 深度 +1（记录从哪开始），
 * 遇到对应闭合标签 → 深度 -1 并整体删掉。
 * 只处理"单标签 + 成对闭合"的常见形态；自闭合标签（`<br />`）不参与嵌套计数。
 */
function stripAlwaysHidden(template) {
  const tagRe = /<\/?([A-Za-z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*)>/g
  /** 栈：每项 = { name, hidden } */
  const stack = []
  const cuts = []
  let m
  while ((m = tagRe.exec(template))) {
    const raw = m[0]
    const name = m[1].toLowerCase()
    const attrs = m[2] ?? ''
    const isClose = raw.startsWith('</')
    const selfClosing = /\/\s*>$/.test(raw) || ['br', 'hr', 'img', 'input', 'meta', 'link'].includes(name)

    if (!isClose) {
      const parentHidden = stack.length > 0 && stack[stack.length - 1].hidden
      const hidden = parentHidden || CONST_FALSE_DIRECTIVE.test(attrs)
      if (!selfClosing) stack.push({ name, hidden, start: m.index })
      if (hidden && !parentHidden) {
        // 这一层是"隐藏区"的起点：记录起点，等它闭合时整段裁掉
        stack[stack.length - 1].cutStart = m.index
      }
      continue
    }

    // 闭合标签：找到同名最近的一层
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].name === name) {
        const frame = stack[i]
        stack.length = i
        if (frame.cutStart !== undefined) {
          cuts.push([frame.cutStart, m.index + raw.length])
        }
        break
      }
    }
  }

  if (!cuts.length) return template
  let out = ''
  let cursor = 0
  for (const [s, e] of cuts.sort((a, b) => a[0] - b[0])) {
    if (s < cursor) continue // 嵌套的隐藏区已被外层覆盖
    out += template.slice(cursor, s)
    cursor = e
  }
  out += template.slice(cursor)
  return out
}

/**
 * 返回「被赋值、但用户看不到」的错误状态名。
 *
 * @param {string} text 整个 .vue 文件内容
 * @returns {string[]}
 */
export function silentStatesOf(text) {
  const tplStart = text.indexOf('<template')
  const tplEnd = text.lastIndexOf('</template>')
  if (tplStart < 0 || tplEnd <= tplStart) return [] // 无模板（纯逻辑组件）不参与
  const template = stripAlwaysHidden(stripComments(text.slice(tplStart, tplEnd)))
  const script = text.slice(0, tplStart) + text.slice(tplEnd + '</template>'.length)

  const declared = new Set()
  for (const m of script.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:ref|shallowRef|computed)\s*[(<]/g)) {
    declared.add(m[1])
  }
  const assigned = new Set()
  for (const m of script.matchAll(/\b([A-Za-z_$][\w$]*)\.value\s*=/g)) assigned.add(m[1])

  const out = []
  for (const name of declared) {
    if (!STATE_NAME.test(name) || !assigned.has(name)) continue
    if (new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`).test(template)) continue
    out.push(name)
  }
  return out
}
