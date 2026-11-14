const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto')
const {PrismaService}=require('../dist/prisma/prisma.service')
const {PagesService}=require('../dist/pages/pages.service')
const {PresetsService}=require('../dist/presets/presets.service')
async function main(){
  const url=new URL(process.env.DATABASE_URL||'')
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55432');assert.equal(url.pathname,'/page_test')
  const db=new PrismaService(),pages=new PagesService(db),presets=new PresetsService(db),ids=[],presetIds=[],postIds=[]
  try{
    const source=await pages.createPage({slug:'qa-nav-'+randomUUID(),title:{vi:'Trang kiểm thử neo'},is_published:false});ids.push(source.id)
    const button={id:randomUUID(),label:{vi:'Khám phá',en:'Explore'},href:'#dich-den',variant:'outline',size:'large',icon:'external',newTab:true,radius:3,backgroundColor:'#123456',textColor:'#abcdef',borderColor:'#fedcba',labelStyle:{fontWeight:'bold'}}
    const content={title:{vi:'Câu chuyện'},linkAnchor:'dich-den',blockButtonsPosition:'before',blockButtonsAlign:'right',blockButtons:[button]}
    const first=await pages.createBlock({page_id:source.id,block_type:'editorial_project',content})
    const unnamed=await pages.createBlock({page_id:source.id,block_type:'hero',content:{title:{vi:'Không có neo'}}})
    await assert.rejects(()=>pages.createBlock({page_id:source.id,block_type:'hero',content:{linkAnchor:'dich-den'}}),/đã được/)
    await assert.rejects(()=>pages.updateBlock(unnamed.id,{content:{linkAnchor:'dich-den'}}),/đã được/)
    const race=await Promise.allSettled([1,2].map(()=>pages.createBlock({page_id:source.id,block_type:'hero',content:{linkAnchor:'concurrent'}})))
    assert.equal(race.filter(result=>result.status==='fulfilled').length,1,'Concurrent duplicate anchor rejected')
    for(const bad of [{...content,linkAnchor:'Có dấu'},{...content,blockButtons:[null]},{...content,blockButtons:[{...button,href:'javascript:alert(1)'}]},{...content,blockButtons:[{...button,radius:101}]}])await assert.rejects(()=>pages.updateBlock(first.id,{content:bad}))
    const renamed=await pages.updateBlock(first.id,{content:{...content,linkAnchor:'doi-ten'}})
    assert.deepEqual(renamed.content.linkAnchorAliases,['dich-den'])
    const clone=await pages.createBlock({page_id:source.id,source_block_id:first.id,block_type:'editorial_project'})
    assert.equal(clone.content.linkAnchor,'doi-ten-2');assert.equal(clone.content.blockButtons[0].href,'#doi-ten-2');assert.equal(clone.content.linkAnchorAliases,undefined)
    const duplicate=await pages.duplicatePage(source.id,{slug:'qa-nav-copy-'+randomUUID()});ids.push(duplicate.id)
    assert.deepEqual((await pages.getAdminPageBySlug(duplicate.slug)).blocks.find(b=>b.content.linkAnchor==='doi-ten').content,renamed.content)
    const template=await pages.createPageTemplate({name:'QA anchor/buttons',source_page_id:source.id});ids.push(template.id)
    const templateBlocks=(await pages.getAdminPageBySlug(template.slug)).blocks
    assert.deepEqual(templateBlocks.find(b=>b.content.linkAnchor==='doi-ten').content,renamed.content)
    const blockPreset=await presets.create({kind:'block',scope:'qa-nav',name:'QA button block',payload:{block_type:'editorial_project',content:renamed.content}});presetIds.push(blockPreset.id)
    assert.deepEqual((await db.cmsPreset.findUnique({where:{id:blockPreset.id}})).payload.content,renamed.content)
    const preset=await presets.create({kind:'page',scope:template.id,source_page_id:template.id,name:'QA nav page'});presetIds.push(preset.id)
    const used=await presets.createPage(preset.id,{slug:'qa-nav-preset-'+randomUUID(),source_template_id:template.id});ids.push(used.id)
    assert.deepEqual((await pages.getAdminPageBySlug(used.slug)).blocks.find(b=>b.content.linkAnchor==='doi-ten').content,renamed.content)
    const cleared=await pages.updateBlock(first.id,{content:{...renamed.content,linkAnchor:''}})
    assert.ok(cleared.content.linkAnchorAliases.includes('doi-ten'));assert.ok(cleared.content.linkAnchorAliases.includes('dich-den'))
    const post=await db.post.create({data:{slug:'qa-nav-blog-'+randomUUID(),title:{vi:'Bài blog thử tìm'},content:'',isPublished:false}});postIds.push(post.id)
    const index=await pages.getCmsLinkIndex()
    assert.equal(index.blocks.some(b=>b.id===first.id),false);assert.equal(index.blocks.some(b=>b.id===unnamed.id),false)
    assert.ok(index.blocks.some(b=>b.id===clone.id));assert.equal(index.blocks.some(b=>templateBlocks.some(t=>t.id===b.id)),false)
    assert.ok(index.posts.some(p=>p.id===post.id&&p.is_published===false))
    assert.equal(index.posts.find(p=>p.id===post.id).content,undefined,'Blog index excludes body')
    console.log('Named anchor uniqueness/concurrency/history, clone self-links, full button JSON, page/templates/presets and private blog index passed')
  }finally{
    await db.post.deleteMany({where:{id:{in:postIds}}});await db.cmsPreset.deleteMany({where:{id:{in:presetIds}}});await db.page.deleteMany({where:{id:{in:ids}}});await db.$disconnect()
  }
}
main().catch(error=>{console.error(error);process.exitCode=1})
