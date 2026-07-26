import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  await prisma.page.upsert({
    where: { slug: 'home' },
    update: {},
    create: {
      slug: 'home',
      title: { vi: 'Trang chủ', en: 'Home', ru: 'Главная', zh: '首页' },
      isPublished: true,
      sortOrder: 1,
    },
  })

  const settings: Array<{ key: string; value: unknown }> = [
    { key: 'site_title', value: { vi: 'Điêu Khắc Ánh Sáng', en: 'Light Sculpture' } },
    { key: 'site_description', value: { vi: 'Nghệ thuật sống trong dòng chảy đương đại', en: 'Living art in the contemporary flow' } },
    { key: 'contact_email', value: 'contact@dieukhacanhsang.vn' },
    { key: 'social_links', value: { facebook: '', youtube: '', instagram: '' } },
    { key: 'show_blog', value: true },
  ]

  for (const setting of settings) {
    await prisma.siteSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: { key: setting.key, value: setting.value as never },
    })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error(error)
    await prisma.$disconnect()
    process.exit(1)
  })
