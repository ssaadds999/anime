
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

type SubtitleEntry = {
  id: number;
  text: string;
};

type Character = {
  name: string;
  description?: string;
  pronoun?: string;
  speakingStyle?: string;
  relationships?: string;
};

type GlossaryItem = {
  original: string;
  translation: string;
};


const RETRY_DELAYS = [2000, 4000, 8000];

const FALLBACK_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.8-flash",
];

function getErrorInfo(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return { status: undefined, message: String(error) };
  }

  const err = error as {
    status?: number | string;
    code?: number | string;
    message?: string;
  };

  return {
    status: err.status ?? err.code,
    message: err.message || String(error),
  };
}

function isRetryableError(error: unknown) {
  const { status, message } = getErrorInfo(error);

  const statusText = String(status || "").toUpperCase();
  const messageText = message.toUpperCase();

  return (
    ["429", "500", "502", "503", "504", "UNAVAILABLE", "RESOURCE_EXHAUSTED"].includes(
      statusText
    ) ||
    /429|500|502|503|504|UNAVAILABLE|RESOURCE_EXHAUSTED|HIGH DEMAND|INTERNAL SERVER ERROR/.test(
      messageText
    )
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function generateWithRetry(
  contents: string,
  config: Parameters<typeof ai.models.generateContent>[0]["config"]
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < FALLBACK_MODELS.length; attempt++) {
    const model = FALLBACK_MODELS[attempt];

    try {
      console.log(
        `Gemini request: attempt ${attempt + 1}, model: ${model}`
      );

      return await ai.models.generateContent({
        model,
        contents,
        config,
      });
    } catch (error) {
      lastError = error;

      if (
        !isRetryableError(error) ||
        attempt === FALLBACK_MODELS.length - 1
      ) {
        throw error;
      }

      const delay = RETRY_DELAYS[attempt];

      console.warn(
        `${model} unavailable. Switching model in ${delay / 1000}s...`
      );

      await sleep(delay);
    }
  }

  throw lastError || new Error("Gemini translation failed");
}


export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "ไม่พบ GEMINI_API_KEY ใน .env.local" },
        { status: 500 }
      );
    }

    const body = await request.json();

    const entries = body.entries as SubtitleEntry[];
    const characters = (body.characters || []) as Character[];
    const glossary = (body.glossary || []) as GlossaryItem[];
    const context =
      typeof body.context === "string" ? body.context : "";

    if (!Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: "ไม่พบข้อความซับสำหรับแปล" },
        { status: 400 }
      );
    }

    if (entries.length > 30) {
      return NextResponse.json(
        { error: "หนึ่งครั้งแปลได้สูงสุด 30 บรรทัดในเวอร์ชันทดสอบ" },
        { status: 400 }
      );
    }

    const validEntries = entries.every(
      (entry) =>
        Number.isInteger(entry.id) &&
        typeof entry.text === "string" &&
        entry.text.trim().length > 0
    );

    if (!validEntries) {
      return NextResponse.json(
        { error: "รูปแบบข้อมูลซับไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(characters) ||
      !characters.every(
        (item) =>
          item &&
          typeof item.name === "string" &&
          item.name.trim().length > 0
      )
    ) {
      return NextResponse.json(
        { error: "ข้อมูลตัวละครไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(glossary) ||
      !glossary.every(
        (item) =>
          item &&
          typeof item.original === "string" &&
          typeof item.translation === "string" &&
          item.original.trim().length > 0 &&
          item.translation.trim().length > 0
      )
    ) {
      return NextResponse.json(
        { error: "ข้อมูล Glossary ไม่ถูกต้อง" },
        { status: 400 }
      );
    }

    const subtitleData = entries.map((entry) => ({
      id: entry.id,
      text: entry.text,
    }));

    const prompt = `
คุณคือนักแปลซับอนิเมะและภาพยนตร์เป็นภาษาไทยระดับมืออาชีพ

ตรวจจับภาษาต้นฉบับโดยอัตโนมัติ รองรับภาษาญี่ปุ่นและภาษาอังกฤษ
แปลทุกบรรทัดเป็นภาษาไทยธรรมชาติ อ่านลื่นเหมือนซับมืออาชีพ

เป้าหมาย:
แปลบทสนทนาให้เป็นภาษาไทยธรรมชาติ อ่านลื่นเหมือนซับอนิเมะมืออาชีพ

กฎการแปล:
1. ตรวจจับภาษาต้นฉบับโดยอัตโนมัติ แล้วแปลเป็นภาษาไทย
2. รองรับทั้งภาษาญี่ปุ่นและภาษาอังกฤษ
3. รักษาอารมณ์ น้ำเสียง และบุคลิกของตัวละคร
4. ใช้บริบทของเรื่องช่วยตีความบทสนทนา
5. ไม่แปลตรงตัวจนภาษาไทยฟังดูแข็ง
6. ไม่เพิ่มเนื้อหาที่ไม่มีในต้นฉบับ
7. ไม่รวม แยก หรือลบบรรทัด
7. รักษา ID ของทุกบรรทัดให้ตรงกับต้นฉบับ
8. หากมีข้อมูลตัวละคร ให้ยึดข้อมูลนั้นอย่างสม่ำเสมอ
9. หากมี Glossary ให้ใช้คำแปลที่กำหนดเป็นหลักทุกครั้ง
10. หากไม่แน่ใจเรื่องสรรพนาม ให้พิจารณาความสัมพันธ์และบริบทก่อนเลือกใช้
11. ห้ามแปลชื่อเฉพาะเป็นคำอื่นโดยไม่มีเหตุผล

ข้อมูลบริบทของเรื่อง:
${context.trim() || "ไม่มีข้อมูลเพิ่มเติม"}

ข้อมูลตัวละคร:
${JSON.stringify(characters, null, 2)}

Glossary (คำศัพท์ที่ต้องใช้ตามที่กำหนด):
${JSON.stringify(glossary, null, 2)}

ตัวอย่าง:
ต้นฉบับ: そんなことあるわけないだろ！
คำแปล: เรื่องแบบนั้นมันจะเป็นไปได้ยังไงล่ะ!

ต้นฉบับ:
${JSON.stringify(subtitleData)}

ส่งผลลัพธ์เป็น JSON เท่านั้น
`;

    const response = await generateWithRetry(prompt, {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          translations: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                id: { type: "INTEGER" },
                text: { type: "STRING" },
              },
              required: ["id", "text"],
            },
          },
        },
        required: ["translations"],
      },
    });

    const result = JSON.parse(response.text || "{}");

    if (!Array.isArray(result.translations)) {
      throw new Error("AI ส่งผลลัพธ์ไม่ถูกต้อง");
    }

    const translated = result.translations;

    if (
      translated.length !== entries.length ||
      translated.some(
        (item: { id: number; text: string }) =>
          !Number.isInteger(item.id) ||
          typeof item.text !== "string" ||
          !entries.some((original) => original.id === item.id)
      ) ||
      new Set(
        translated.map((item: { id: number }) => item.id)
      ).size !== entries.length
    ) {
      throw new Error(
        "AI ส่งจำนวนบรรทัดหรือ ID ไม่ตรงกับต้นฉบับ"
      );
    }

    return NextResponse.json({
      success: true,
      translations: translated,
    });
  } catch (error) {
    console.error("Translation error:", error);

    const retryable = isRetryableError(error);
    const { message } = getErrorInfo(error);

    return NextResponse.json(
      {
        error: retryable
          ? "Gemini กำลังมีผู้ใช้งานหนาแน่น ระบบลองใหม่ครบแล้ว กรุณารอสักครู่แล้วลองอีกครั้ง"
          : message || "เกิดข้อผิดพลาดในการแปล",
      },
      { status: retryable ? 503 : 500 }
    );
  }
}
