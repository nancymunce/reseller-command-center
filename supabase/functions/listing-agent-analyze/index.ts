// Supabase Edge Function: listing-agent-analyze
// Deploy only after configuring OPENAI_API_KEY as a Supabase secret.
// The browser sends authenticated image data + known item facts; the key never reaches GitHub Pages.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok",{headers:cors});
  try {
    const auth=req.headers.get("Authorization");
    if(!auth) return new Response(JSON.stringify({error:"Sign in required"}),{status:401,headers:{...cors,"Content-Type":"application/json"}});
    const key=Deno.env.get("OPENAI_API_KEY");
    if(!key) return new Response(JSON.stringify({error:"Listing Agent AI is not configured yet"}),{status:503,headers:{...cors,"Content-Type":"application/json"}});
    const {images=[],facts={}}=await req.json();
    if(!images.length) throw new Error("At least one photo is required");
    const prompt=`You are an expert resale listing assistant. Analyze only what the photos support. Do not invent maker, model, age, material, condition, or provenance. Clearly flag uncertainty. Produce a concise marketplace-ready draft. User facts: ${JSON.stringify(facts)}. Return ONLY JSON with keys title, brand, category, condition, suggested_price, description, research_notes.`;
    const input=[{role:"user",content:[{type:"input_text",text:prompt},...images.map((image:string)=>({type:"input_image",image_url:image}))]}];
    const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({model:"gpt-5.6",input})});
    const data=await r.json(); if(!r.ok) throw new Error(data?.error?.message||"AI request failed");
    const text=data.output?.flatMap((o:any)=>o.content||[]).find((x:any)=>x.type==="output_text")?.text;
    if(!text) throw new Error("No draft returned");
    let draft; try{draft=JSON.parse(text.replace(/^\`\`\`json\s*|\`\`\`$/g,"").trim())}catch{throw new Error("AI returned an unreadable draft")};
    return new Response(JSON.stringify({draft}),{headers:{...cors,"Content-Type":"application/json"}});
  } catch(e) {return new Response(JSON.stringify({error:e.message||"Listing Agent failed"}),{status:400,headers:{...cors,"Content-Type":"application/json"}});}
});
