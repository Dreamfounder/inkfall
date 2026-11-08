/* 数据总装与世界观常量 */
window.INK_DATA = {
  meta: {
    title: '墨蚀',
    subtitle: '拾字纪',
    en: 'INKFALL · THE UNWRITTEN',
    version: '1.0',
    tagline: '当世界开始失字，你是最后一个补字师。',
    description: '一款以汉字为骨、以故事为墨的叙事打字游戏。补全被空白吃掉的字句，在十二卷长卷里，替世界留下一个继续写下去的理由。',
    world: [
      {
        title: '墨界',
        text: '万物被写下来，才算真正存在。城郭、河流、人的姓名，都系于《万卷初版》的字脉。'
      },
      {
        title: '白蚀',
        text: '三十年前，三位校书人从初版末行删去九个字。被删去的句子没有消失，它化作空白，从纸外一点点渗回来。'
      },
      {
        title: '刻印',
        text: '补字师以断锋笔重写失落的字句。每一笔都必须准确，因为空白会顺着错误的笔画钻进来。'
      }
    ]
  },
  prologue: {
    eyebrow: '墨历九十七年 · 拾遗城',
    title: '世界正在失去名字',
    body: [
      '在我出生前，墨界的人相信：万物被写下来，才算真正存在。',
      '直到十年前，第一片空白落在城北。它不吞噬房屋，只吃掉字。招牌空了，人的名字也空了。被吃掉名字的人仍站在原处，只是再没人能想起他。',
      '母亲是最后一个守字人。她走进空白的那天，只留给我一页无字的纸。',
      '现在，我叫沈砚。我是拾遗城最年轻的补字师。',
      '而你，正在读这些字。'
    ],
    cta: '翻开第一页'
  },
  tiers: [
    {
      tier: 1,
      name: '初执笔',
      en: 'FIRST STROKE',
      desc: '短句与常用字。适合第一次落笔的人，先让指尖记住节奏。'
    },
    {
      tier: 2,
      name: '渐入墨',
      en: 'INK IN MOTION',
      desc: '叙事长句与自然标点。速度之外，开始考验稳定的呼吸。'
    },
    {
      tier: 3,
      name: '校字师',
      en: 'THE PROOFREADER',
      desc: '复句、对话与密集标点。一次分神，就可能在句读处留下败笔。'
    },
    {
      tier: 4,
      name: '补字师',
      en: 'THE RESTORER',
      desc: '生僻字与长段引文。字与字之间不再有喘息，只有笔锋相接。'
    },
    {
      tier: 5,
      name: '守字人',
      en: 'THE WORDKEEPER',
      desc: '接近极限的长篇刻印。献给愿意把一段文字完整背负下来的人。'
    }
  ],
  ranks: [
    { min: 0, name: '初执笔', en: 'APPRENTICE' },
    { min: 3, name: '抄字人', en: 'COPYIST' },
    { min: 8, name: '校字师', en: 'PROOFREADER' },
    { min: 16, name: '补字师', en: 'RESTORER' },
    { min: 26, name: '守字人', en: 'WORDKEEPER' },
    { min: 40, name: '执笔人', en: 'THE AUTHOR' }
  ],
  chapters: window.INK_STORY,
  sideStories: window.INK_SIDES,
  challenges: window.INK_CHALLENGES
};
