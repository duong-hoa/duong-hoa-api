import { BadRequestException } from '@nestjs/common'
const legacyTypes = new Set(['hba','hillbrook','hillbrook_inner'])
const reserved = new Set(['top','story','gallery','discover'])
export const blockObject = (value:unknown):Record<string,unknown> => value && typeof value==='object' && !Array.isArray(value) ? value as Record<string,unknown> : {}
export const validLinkAnchor = (value:unknown):value is string => typeof value==='string' && /^[a-z][a-z0-9_-]{0,99}$/.test(value) && !reserved.has(value)
export function namedBlockAnchor(content:unknown,type:string) {
  const c=blockObject(content),value=Object.hasOwn(c,'linkAnchor')?c.linkAnchor:legacyTypes.has(type)?c.anchor:''
  return validLinkAnchor(value)?value:''
}
export function reservedBlockAnchors(content:unknown,type:string) {
  const c=blockObject(content)
  return [...new Set([namedBlockAnchor(c,type),...(Array.isArray(c.linkAnchorAliases)?c.linkAnchorAliases.filter(validLinkAnchor):[]),...(legacyTypes.has(type)&&typeof c.anchor==='string'&&c.anchor.trim()?[c.anchor.trim()]:[])].filter(Boolean))]
}
export function validateBlockNavigation(content:unknown) {
  const c=blockObject(content)
  if(c.linkAnchor && !validLinkAnchor(c.linkAnchor))throw new BadRequestException('Neo liên kết cần bắt đầu bằng chữ a–z, chỉ dùng chữ thường, số, - hoặc _, tối đa 100 ký tự; không dùng top, story, gallery, discover.')
  if(c.blockButtons!=null&&!Array.isArray(c.blockButtons))throw new BadRequestException('Danh sách nút của block không hợp lệ')
  const ids=new Set<string>()
  for(const value of (c.blockButtons as unknown[]||[])) {
    const button=blockObject(value),label=typeof button.label==='string'?button.label:blockObject(button.label).vi
    if(typeof button.id!=='string'||!button.id||ids.has(button.id))throw new BadRequestException('Nút cần có mã riêng, không trùng nhau trong block')
    ids.add(button.id)
    if(typeof label!=='string'||!label.trim())throw new BadRequestException('Hãy nhập tên Tiếng Việt cho tất cả nút bổ sung')
    if(typeof button.href!=='string'||!button.href.trim()||!/^(\/(?!\/)|https?:\/\/|#|mailto:|tel:)/i.test(button.href.trim()))throw new BadRequestException('Hãy chọn liên kết hợp lệ cho tất cả nút bổ sung')
    if(button.variant!=null&&!['solid','outline','soft','text'].includes(String(button.variant)))throw new BadRequestException('Giao diện nút không hợp lệ')
    if(button.size!=null&&!['small','medium','large'].includes(String(button.size)))throw new BadRequestException('Kích thước nút không hợp lệ')
    if(button.icon!=null&&!['none','arrow','external'].includes(String(button.icon)))throw new BadRequestException('Biểu tượng nút không hợp lệ')
    if(button.radius!=null&&(typeof button.radius!=='number'||!Number.isFinite(button.radius)||button.radius<0||button.radius>100))throw new BadRequestException('Độ bo nút phải từ 0 đến 100px')
  }
}
export function preserveAnchorHistory(previous:unknown,next:unknown,type:string) {
  const old=blockObject(previous),c=blockObject(next),before=namedBlockAnchor(old,type),after=namedBlockAnchor(c,type)
  const aliases=[...new Set([...(Array.isArray(old.linkAnchorAliases)?old.linkAnchorAliases.filter(validLinkAnchor):[]),...(before&&before!==after?[before]:[])])].filter(anchor=>anchor!==after)
  return aliases.length||Object.hasOwn(old,'linkAnchorAliases')?{...c,linkAnchorAliases:aliases}:c
}
export function uniqueCopiedAnchor(base:string,used:Set<string>) {
  let n=2,value=base
  while(used.has(value)){const suffix=`-${n++}`;value=base.slice(0,100-suffix.length)+suffix}
  used.add(value);return value
}
export function copyBlockNavigation(content:unknown,type:string,used:Set<string>) {
  const c={...blockObject(content)},map=new Map<string,string>(),anchor=namedBlockAnchor(c,type)
  if(anchor){const next=uniqueCopiedAnchor(anchor,used);c.linkAnchor=next;map.set(anchor,next)
    for(const old of (Array.isArray(c.linkAnchorAliases)?c.linkAnchorAliases.filter(validLinkAnchor):[]))map.set(old,next)
  }
  if(legacyTypes.has(type)&&typeof c.anchor==='string'&&c.anchor.trim()){
    const old=c.anchor.trim(),next=map.get(old)||uniqueCopiedAnchor(validLinkAnchor(old)?old:'block',used)
    map.set(old,next);c.anchor=next
  }
  delete c.linkAnchorAliases
  return {content:c,anchors:map}
}
