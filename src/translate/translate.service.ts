import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { getTargetLangs } from './languages.util'

function toHttpError(err: unknown): HttpException {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes('GEMINI_RATE_LIMIT')) return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS)
  return new HttpException(message, HttpStatus.SERVICE_UNAVAILABLE)
}

const LANGUAGE_NAMES: Record<string, string> = {
  vi: 'Vietnamese',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
}

const GOOGLE_LANG_MAP: Record<string, string> = {
  vi: 'vi',
  en: 'en',
  ru: 'ru',
  zh: 'zh-CN',
}

// Keys that should never be translated (config/layout/media fields).
const NON_TRANSLATABLE_KEYS = new Set([
  'theme', 'imagePosition', 'mediaType', 'chapterNumber', 'id',
  'parallax', 'bodyColumns', 'miniCardsLayout', 'columns', 'cardStyle',
  'contentAlign', 'src', 'href', 'variant', 'is3d', 'fancyboxGroup',
  'sort_order', 'is_visible', 'block_type', 'page_id',
  'images', 'galleryBelow', 'youtubeId', 'ornamentPosition', 'prefix',
  'iconKey', 'number', 'priceVnd',
])

const URL_KEYS = new Set(['src', 'href', 'image', 'cover_image', 'seo_image'])

// Only matches the scalar-text localized shape ({ vi: 'text', en: 'text' }),
// not the array-of-per-locale-arrays shape ({ vi: ['a','b'], en: [] }) used
// for translatable paragraph lists (body, items, etc.) — those two shapes
// both have vi/en/ru/zh keys, but only this one holds plain strings under
// them, so we also check that any present key's value is actually a string.
// Without this check, an array-shaped field would still match here (wrongly)
// and crash on `sourceText.trim()` a few lines down, since sourceText would
// be an array, not a string — that crash is what this guards against.
function isLocalizedObject(val: unknown): val is Record<string, string> {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return false
  const obj = val as Record<string, unknown>
  const keys = ['vi', 'en', 'ru', 'zh'] as const
  return keys.some((k) => k in obj) && keys.every((k) => !(k in obj) || typeof obj[k] === 'string')
}

function isHtmlText(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

function cleanHtmlOutput(html: string): string {
  let cleaned = html.trim()
  cleaned = cleaned.replace(/^```(?:html)?\s*/i, '').replace(/\s*```$/i, '').trim()
  return cleaned
}

@Injectable()
export class TranslateService {
  constructor(private readonly config: ConfigService) {}

  private async callGemini(prompt: string, systemInstruction?: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY')
    if (!apiKey) {
      throw new Error('GEMINI_NOT_CONFIGURED')
    }

    // Supported production models with fallback. `gemini-2.0-flash` and
    // `gemini-1.5-flash` were both retired by Google (404 "no longer
    // available") — confirmed live 2026-08-05, which is what was actually
    // causing "Dịch tự động" to silently return only-Vietnamese content:
    // every call fell through Gemini, then further fell through to the
    // Google Translate fallback below, and in some environments that fallback
    // itself is unreachable (network egress), so translateWithGoogle's own
    // catch-and-return-original-text safety net kicked in — the net result
    // being every locale silently ending up with the original Vietnamese
    // text and no error surfaced anywhere. Re-check https://ai.google.dev/gemini-api/docs/models
    // periodically; Google deprecates model names faster than most APIs.
    const models = ['gemini-2.5-flash', 'gemini-2.5-flash-lite']
    let lastError: Error | null = null

    for (const model of models) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      const body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1 },
        ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      }

      const retries = 2
      let delay = 500

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (res.status === 429) {
            if (attempt === retries - 1) throw new Error('GEMINI_RATE_LIMIT')
            await new Promise((r) => setTimeout(r, delay))
            delay *= 2
            continue
          }

          if (!res.ok) {
            const errorText = await res.text()
            if (res.status === 429 || errorText.includes('RESOURCE_EXHAUSTED') || errorText.includes('rate limit')) {
              throw new Error('GEMINI_RATE_LIMIT')
            }
            if (res.status === 404 || errorText.includes('not found')) {
              lastError = new Error(`Model ${model} not found`)
              break
            }
            throw new Error(`HTTP ${res.status}: ${errorText}`)
          }

          const data = await res.json()
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
          return text.trim()
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          if (errMsg.includes('GEMINI_RATE_LIMIT')) throw err
          if (errMsg.includes('not found')) break
          if (attempt === retries - 1) lastError = err instanceof Error ? err : new Error(String(err))
          await new Promise((r) => setTimeout(r, delay))
          delay *= 1.5
        }
      }
    }

    throw lastError || new Error('Gemini API call failed.')
  }

  private async translateWithGoogle(text: string, fromLang: string, toLang: string): Promise<string> {
    if (!text.trim()) return text
    if (fromLang === toLang) return text

    const sl = GOOGLE_LANG_MAP[fromLang] || fromLang
    const tl = GOOGLE_LANG_MAP[toLang] || toLang

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t`
    const body = new URLSearchParams()
    body.append('q', text)

    const retries = 4
    let delay = 500

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        })

        if (res.status === 429) {
          await new Promise((r) => setTimeout(r, delay))
          delay *= 2
          continue
        }

        if (!res.ok) throw new Error(`HTTP ${res.status}`)

        const data = await res.json()
        return (data[0] as Array<[string]>).map((seg) => seg[0]).join('')
      } catch (err) {
        if (attempt === retries - 1) {
          console.error(`Google Translation error after retries (${fromLang} → ${toLang}):`, err)
          return text
        }
        await new Promise((r) => setTimeout(r, delay))
        delay *= 1.5
      }
    }
    return text
  }

  async translateText(text: string, fromLang: string, toLang: string, engine: 'google' | 'gemini' = 'gemini'): Promise<string> {
    if (!text.trim()) return text
    if (fromLang === toLang) return text

    if (engine === 'gemini') {
      const fromName = LANGUAGE_NAMES[fromLang] || fromLang
      const toName = LANGUAGE_NAMES[toLang] || toLang

      const systemInstruction = `You are a professional translator. Translate the text from ${fromName} to ${toName}.
Keep the translation natural, fluent, and accurate. Do not add any explanation, commentary, preamble, notes, or markdown formatting.
Do not wrap output in quotation marks. Preserve any placeholders (like {var}, %s) exactly as they are.
Output ONLY the raw translated text.`

      try {
        const translated = await this.callGemini(text, systemInstruction)
        if (translated) return translated
      } catch (err) {
        console.warn(`Gemini translation error (${fromLang} → ${toLang}), falling back to Google Translate:`, err instanceof Error ? err.message : err)
        const errMsg = err instanceof Error ? err.message : String(err)
        if (errMsg.includes('GEMINI_NOT_CONFIGURED')) throw toHttpError(err)
      }
    }

    return this.translateWithGoogle(text, fromLang, toLang)
  }

  async translateHTML(html: string, fromLang: string, toLang: string, engine: 'google' | 'gemini' = 'gemini'): Promise<string> {
    if (!html.trim()) return html
    if (fromLang === toLang) return html

    if (engine === 'gemini') {
      const fromName = LANGUAGE_NAMES[fromLang] || fromLang
      const toName = LANGUAGE_NAMES[toLang] || toLang

      const systemInstruction = `You are a professional translator. Translate the HTML content from ${fromName} to ${toName}.
You MUST preserve all HTML tags, tag structure, class names, IDs, inline styles, and attributes exactly as they are. Translate ONLY the text content inside the HTML.
Do NOT translate code, tags, or attribute values. Do NOT wrap the output in markdown code blocks (such as \`\`\`html).
Output ONLY the raw translated HTML.`

      try {
        const translated = await this.callGemini(html, systemInstruction)
        const cleaned = cleanHtmlOutput(translated)
        if (cleaned) return cleaned
      } catch (err) {
        console.warn(`Gemini HTML translation error (${fromLang} → ${toLang}), falling back to Google Translate:`, err instanceof Error ? err.message : err)
        const errMsg = err instanceof Error ? err.message : String(err)
        if (errMsg.includes('GEMINI_NOT_CONFIGURED')) throw toHttpError(err)
      }
    }

    return this.translateWithGoogle(html, fromLang, toLang)
  }

  async translateBatch(
    texts: string[],
    fromLang: string,
    toLang: string,
    isHTML = false,
    engine: 'google' | 'gemini' = 'gemini',
  ): Promise<string[]> {
    const results: string[] = []

    for (let i = 0; i < texts.length; i++) {
      const item = texts[i]
      const useHtml = isHTML || isHtmlText(item)
      const fn = useHtml ? this.translateHTML.bind(this) : this.translateText.bind(this)

      const translated = await fn(item, fromLang, toLang, engine)
      results.push(translated)
      if (i < texts.length - 1) {
        await new Promise((r) => setTimeout(r, engine === 'gemini' ? 150 : 250))
      }
    }

    return results
  }

  async translateContentObject(
    content: Record<string, unknown>,
    fromLang: string,
    engine: 'google' | 'gemini' = 'gemini',
  ): Promise<Record<string, unknown>> {
    const targets = getTargetLangs(fromLang)
    const result = { ...content }

    for (const key of Object.keys(result)) {
      if (NON_TRANSLATABLE_KEYS.has(key) || URL_KEYS.has(key)) continue

      const val = result[key]

      if (isLocalizedObject(val)) {
        const sourceText = (val[fromLang] as string) || ''
        if (!sourceText.trim()) continue

        const useHtml = isHtmlText(sourceText)
        const fn = useHtml ? this.translateHTML.bind(this) : this.translateText.bind(this)

        const translated: Record<string, string> = { ...val }
        for (const lang of targets) {
          translated[lang] = await fn(sourceText, fromLang, lang, engine)
          await new Promise((r) => setTimeout(r, engine === 'gemini' ? 150 : 250))
        }
        result[key] = translated
        continue
      }

      if (Array.isArray(val)) {
        const newArr = [...val]
        for (let i = 0; i < newArr.length; i++) {
          const item = newArr[i]

          if (isLocalizedObject(item)) {
            const sourceText = (item as Record<string, string>)[fromLang] || ''
            if (!sourceText.trim()) continue

            const useHtml = isHtmlText(sourceText)
            const fn = useHtml ? this.translateHTML.bind(this) : this.translateText.bind(this)

            const translated: Record<string, string> = { ...(item as Record<string, string>) }
            for (const lang of targets) {
              translated[lang] = await fn(sourceText, fromLang, lang, engine)
              await new Promise((r) => setTimeout(r, engine === 'gemini' ? 150 : 250))
            }
            newArr[i] = translated
          } else if (item && typeof item === 'object' && !Array.isArray(item)) {
            newArr[i] = await this.translateContentObject(item as Record<string, unknown>, fromLang, engine)
          }
        }
        result[key] = newArr
        continue
      }

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        const obj = val as Record<string, unknown>
        if (Array.isArray(obj[fromLang])) {
          const sourceArr = obj[fromLang] as string[]
          const translated: Record<string, string[]> = { ...obj } as Record<string, string[]>
          for (const lang of targets) {
            const langArr: string[] = []
            for (const text of sourceArr) {
              if (text.trim()) {
                const useHtml = isHtmlText(text)
                const fn = useHtml ? this.translateHTML.bind(this) : this.translateText.bind(this)
                langArr.push(await fn(text, fromLang, lang, engine))
                await new Promise((r) => setTimeout(r, engine === 'gemini' ? 150 : 250))
              } else {
                langArr.push(text)
              }
            }
            translated[lang] = langArr
          }
          result[key] = translated
        } else {
          result[key] = await this.translateContentObject(obj, fromLang, engine)
        }
      }
    }

    return result
  }
}
