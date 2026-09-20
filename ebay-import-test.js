const supabaseClient = window.supabase.createClient("https://desygsdzinuvofjufvft.supabase.co","sb_publishable_iw1n9EupBt8qFZUNrvPrBA_UEnA8bqn");
const $=id=>document.getElementById(id);
function money(v){const n=Number(String(v??"").replace(/[$,]/g,""));return Number.isFinite(n)?n:0}
function csvRows(text){const rows=[];let row=[],cell="",q=false;for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'&&q&&n==='"'){cell+='"';i++;}else if(c==='"'){q=!q;}else if(c===','&&!q){row.push(cell);cell="";}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell);if(row.some(x=>x!==""))rows.push(row);row=[];cell="";}else cell+=c;}row.push(cell);if(row.some(x=>x!==""))rows.push(row);return rows}
function objects(rows,headerIndex=0){const h=rows[headerIndex].map(x=>x.trim());return rows.slice(headerIndex+1).filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??""])))}
function detect(rows){for(let i=0;i<Math.min(rows.length,6);i++){const h=rows[i].join("|");if(h.includes("Item number")&&h.includes("Available quantity"))return {type:"active",header:i};if(h.includes("Sales Record Number")&&h.includes("Order Number")&&h.includes("Item Number"))return {type:"sold",header:i};if(h.includes("Min Offer (USD)")&&h.includes("Offers Allowed")&&h.includes("Last Modified"))return {type:"draft",header:i};}return null}
function normalize(type,o,index){
 if(type==="active")return {source:"Active",id:o["Item number"],title:o.Title,status:"Active",price:money(o["Current price"]||o["Start price"]),sku:o["Custom label (SKU)"],action:"Import/update eBay listing",rawSafe:{category:o["eBay category 1 name"],categoryId:o["eBay category 1 number"],condition:o.Condition,quantity:o["Available quantity"],watchers:o.Watchers,startDate:o["Start date"],endDate:o["End date"]}};
 if(type==="sold")return {source:"Order",id:o["Item Number"],title:o["Item Title"],status:"Sold",price:money(o["Sold For"]),sku:o["Custom Label"],action:"Match existing item before creating anything",rawSafe:{orderNumber:o["Order Number"],quantity:o.Quantity,promoted:o["Sold Via Promoted Listings"],shippingCollected:money(o["Shipping And Handling"]),saleDate:o["Sale Date"]||o["Paid On Date"]||""}};
 return {source:"Draft",id:"Draft "+(index+1),title:o.Title,status:"Draft",price:money(o["Price (USD)"]),sku:"",action:"Master-item candidate; review first",rawSafe:{category:o.Category,condition:o.Condition,quantity:o.Quantity,format:o.Format,lastModified:o["Last Modified"],description:o.Description,notes:o.Notes,itemSpecifics:o["Item Specifics"],photoCount:o.Photos,minOffer:money(o["Min Offer (USD)"]),offersAllowed:o["Offers Allowed"]}};
}
let records=[],inventory=[],existingListings=[];
const stop=new Set(["the","a","an","and","or","with","of","for","to","in","on","vintage","set","lot","new","used"]);
function tokens(s){return new Set(String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>1&&!stop.has(x)))}
function similarity(a,b){const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let hit=0;A.forEach(x=>{if(B.has(x))hit++});const j=hit/(A.size+B.size-hit),contain=hit/Math.min(A.size,B.size);return Math.round(100*(0.45*j+0.55*contain))}
function bestInventoryMatch(r){let best=null;for(const item of inventory){const names=[item.listing_title,item.title].filter(Boolean);const titleScore=Math.max(0,...names.map(n=>similarity(r.title,n)));const itemPrices=[item.sale_price,item.list_price,item.target_price].map(Number).filter(Number.isFinite);const priceMatch=r.price&&itemPrices.some(p=>Math.abs(p-r.price)<0.01);let adjusted=titleScore+(priceMatch?12:0);if(titleScore>=60&&priceMatch)adjusted+=8;if(titleScore>=85)adjusted+=8;adjusted=Math.min(100,adjusted);if(!best||adjusted>best.score)best={item,score:adjusted,titleScore,priceMatch}}return best}
function reconcile(){
 const byExternal=new Map(existingListings.map(x=>[String(x.external_listing_id||""),x]));
 records=records.map(r=>{if(r.source!=="Draft"&&r.id&&byExternal.has(String(r.id)))return {...r,reconcile:"Already imported",match:"eBay ID",confidence:100};
 const best=bestInventoryMatch(r);if(best&&best.score>=78)return {...r,reconcile:"Likely existing master item",match:best.item.title,confidence:best.score};
 if(best&&best.score>=45)return {...r,reconcile:"Needs review",match:best.item.title,confidence:best.score};
 return {...r,reconcile:r.source==="Draft"?"New master-item candidate":"No confident master match",match:"—",confidence:0};});
}
async function loadCloudReference(){
 const {data:{session}}=await supabaseClient.auth.getSession();if(!session)throw new Error("Sign in to the Command Center first, then reopen this page.");
 const [i,l]=await Promise.all([supabaseClient.from("inventory_items").select("id,title,listing_title,master_sku,status,list_price,target_price,sale_price"),supabaseClient.from("marketplace_listings").select("id,external_listing_id,inventory_item_id,status").eq("marketplace","eBay")]);
 if(i.error)throw i.error;if(l.error)throw l.error;inventory=i.data||[];existingListings=l.data||[];
 $("cloudReference").textContent=inventory.length+" master items · "+existingListings.length+" eBay listing records";
}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(files,warnings){reconcile();$("resultsPanel").hidden=false;$("reportCount").textContent=files+" file"+(files===1?"":"s");
 const active=records.filter(x=>x.source==="Active"),sold=records.filter(x=>x.source==="Order"),draft=records.filter(x=>x.source==="Draft");
 $("activeCount").textContent=active.length;$("soldCount").textContent=sold.length;$("draftCount").textContent=draft.length;
 $("itemIdCount").textContent=new Set(records.filter(x=>!x.id.startsWith("Draft ")).map(x=>x.id).filter(Boolean)).size;
 $("matchedCount").textContent=records.filter(x=>x.reconcile==="Already imported"||x.reconcile==="Likely existing master item").length;
 $("reviewCount").textContent=records.filter(x=>x.reconcile==="Needs review").length;
 $("newCount").textContent=records.filter(x=>x.reconcile==="New master-item candidate"||x.reconcile==="No confident master match").length;
 $("warnings").innerHTML=warnings.length?'<p class="import-note">'+warnings.map(esc).join("<br>")+"</p>":"";
 const diag=records.filter(r=>r.source==="Order"||r.reconcile==="Likely existing master item"||r.reconcile==="Already imported").map(r=>"<p><strong>"+esc(r.source)+"</strong> — "+esc(r.title)+" — $"+r.price.toFixed(2)+" — "+esc(r.reconcile)+" — best: "+esc(r.match)+(r.confidence?" ("+r.confidence+"%)":"")+"</p>").join("");
 $("diagnostics").innerHTML="<div class=\"import-note\"><strong>Diagnostics: matches + all sold/order rows</strong>"+(diag||"<p>None</p>")+"</div>";\n $("previewRows").innerHTML=records.map(r=>'<tr><td>'+esc(r.source)+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.status)+'</td><td>$'+r.price.toFixed(2)+'</td><td>'+esc(r.reconcile)+'</td><td>'+esc(r.match)+(r.confidence?' ('+r.confidence+'%)':'')+'</td></tr>').join("");
}
const slots=[["activeFile","activeFileName","active"],["soldFile","soldFileName","sold"],["draftFile","draftFileName","draft"]];
function updateReady(){let ready=true;for(const [inputId,nameId] of slots){const file=$(inputId).files[0];$(nameId).textContent=file?file.name:"No file selected";if(!file)ready=false}$("analyzeBtn").disabled=!ready;$("readyText").textContent=ready?"All three files selected. Ready to analyze.":"Select all three files to continue."}
slots.forEach(([inputId])=>$(inputId).addEventListener("change",updateReady));
$("analyzeBtn").addEventListener("click",async()=>{records=[];const warnings=[];for(const [inputId,,expected] of slots){const file=$(inputId).files[0];const rows=csvRows(await file.text()),d=detect(rows);if(!d){warnings.push(file.name+": report type not recognized.");continue}if(d.type!==expected)warnings.push(file.name+": expected "+expected+" report but detected "+d.type+".");objects(rows,d.header).forEach((o,i)=>records.push(normalize(d.type,o,i)))}render(3,warnings);$("resultsPanel").scrollIntoView({behavior:"smooth",block:"start"});});
loadCloudReference().catch(e=>{$("cloudReference").textContent=e.message;$("cloudReference").classList.add("import-note")})
