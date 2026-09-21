import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:cors});
const allowedInventoryStatus=new Set(["Unlisted","Listed","Sold"]);
const allowedActionResults=new Set(["completed","failed"]);
const listingFields=["inventory_item_id","external_sku","listing_url","title","status","quantity","price","currency","image_urls","raw_data","listed_at","last_synced_at"] as const;
const newInventoryFields=["title","brand","category","purchase_cost","cost_status","purchase_date","source","storage_location","status","list_price","listed_marketplaces","notes","master_sku"] as const;

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"POST required"},405);

  const supplied=req.headers.get("apikey")||"";
  const expected=Deno.env.get("GEORDI_CONNECTOR_KEY")||"";
  if(!expected || supplied!==expected) return json({error:"Unauthorized"},401);

  const url=Deno.env.get("SUPABASE_URL");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const owner=Deno.env.get("GEORDI_OWNER_ID");
  if(!url||!service||!owner) return json({error:"Gateway is not configured"},500);
  const db=createClient(url,service,{auth:{persistSession:false}});
  const body=await req.json().catch(()=>({}));
  const op=String(body.operation||"");

  try{
    if(op==="actions/poll"){
      const limit=Math.min(Math.max(Number(body.limit)||25,1),100);
      const {data,error}=await db.from("marketplace_sync_actions").select("*").eq("owner_id",owner).eq("marketplace","eBay").eq("status","pending").order("created_at",{ascending:true}).limit(limit);
      if(error) throw error; return json({actions:data||[]});
    }

    if(op==="actions/complete" || op==="actions/fail"){
      const id=String(body.id||""); if(!id) return json({error:"id required"},400);
      const status=op==="actions/complete"?"completed":"failed"; if(!allowedActionResults.has(status)) return json({error:"Invalid status"},400);
      const patch=status==="completed"
        ? {status,completed_at:new Date().toISOString(),result_payload:body.result||{},error_message:null}
        : {status,error_message:String(body.error||"Unknown connector error"),result_payload:body.result||{}};
      const {data,error}=await db.from("marketplace_sync_actions").update(patch).eq("id",id).eq("owner_id",owner).eq("marketplace","eBay").select().single();
      if(error) throw error; return json({action:data});
    }

    if(op==="listings/upsert"){
      const external=String(body.external_listing_id||"").trim(); if(!external) return json({error:"external_listing_id required"},400);
      const row:any={owner_id:owner,marketplace:"eBay",external_listing_id:external};
      for(const k of listingFields) if(body[k]!==undefined) row[k]=body[k];
      row.last_synced_at=new Date().toISOString();
      const {data,error}=await db.from("marketplace_listings").upsert(row,{onConflict:"owner_id,marketplace,external_listing_id"}).select().single();
      if(error) throw error; return json({listing:data});
    }

    if(op==="inventory/set-status"){
      const id=String(body.inventory_item_id||""); const status=String(body.status||"");
      if(!id||!allowedInventoryStatus.has(status)) return json({error:"Valid inventory_item_id and status required"},400);
      const {data,error}=await db.from("inventory_items").update({status}).eq("id",id).eq("owner_id",owner).select("id,title,status").single();
      if(error) throw error; return json({inventory:data});
    }

    if(op==="inventory/find-or-create"){
      const inventoryId=body.inventory_item_id?String(body.inventory_item_id):"";
      const sku=body.master_sku?String(body.master_sku).trim():"";
      const storage=body.storage_location?String(body.storage_location).trim():"";
      if(inventoryId){
        const {data,error}=await db.from("inventory_items").select("*").eq("id",inventoryId).eq("owner_id",owner).maybeSingle();
        if(error) throw error; if(data) return json({inventory:data,created:false,matched_by:"id"});
      }
      if(sku){
        const {data,error}=await db.from("inventory_items").select("*").eq("owner_id",owner).eq("master_sku",sku).maybeSingle();
        if(error) throw error; if(data) return json({inventory:data,created:false,matched_by:"master_sku"});
      }
      if(storage){
        const {data,error}=await db.from("inventory_items").select("*").eq("owner_id",owner).eq("storage_location",storage).limit(2);
        if(error) throw error;
        if((data||[]).length===1) return json({inventory:data![0],created:false,matched_by:"storage_location"});
        if((data||[]).length>1) return json({error:"Storage location is not unique; provide master_sku or inventory_item_id"},409);
      }
      if(body.create!==true) return json({inventory:null,created:false,matched_by:null});
      const row:any={owner_id:owner};
      for(const k of newInventoryFields) if(body[k]!==undefined) row[k]=body[k];
      if(!row.title) return json({error:"title required to create inventory"},400);
      row.status=row.status||"Listed"; row.listed_marketplaces=row.listed_marketplaces||["eBay"];
      const {data,error}=await db.from("inventory_items").insert(row).select().single();
      if(error) throw error; return json({inventory:data,created:true,matched_by:null},201);
    }

    return json({error:"Unknown operation"},404);
  }catch(error){console.error("Geordi gateway error",error);return json({error:error instanceof Error?error.message:"Gateway error"},500);}
});
