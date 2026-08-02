import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // One-time bootstrap: create the first admin account so there's a way to
  // log in at all once ADMIN_EMAIL/ADMIN_PASSWORD env-based auth is gone.
  // These vars are only read here, at seed time — never checked at request
  // time. Safe to unset again after the first successful login; manage
  // further accounts (and change this one's password) via /admin/accounts.
  const existingAdminCount = await prisma.adminUser.count()
  if (existingAdminCount === 0) {
    const seedEmail = process.env.SEED_ADMIN_EMAIL
    const seedPassword = process.env.SEED_ADMIN_PASSWORD
    if (seedEmail && seedPassword) {
      await prisma.adminUser.create({
        data: {
          email: seedEmail.toLowerCase(),
          passwordHash: await bcrypt.hash(seedPassword, 10),
          displayName: process.env.SEED_ADMIN_NAME || 'Admin',
          role: 'admin',
        },
      })
      console.log(`Created bootstrap admin account: ${seedEmail}`)
    } else {
      console.warn(
        'No admin_users rows exist and SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD are not set — ' +
          'set them and re-run `npm run prisma:seed` to create the first login.',
      )
    }
  }

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
