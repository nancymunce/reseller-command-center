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
let records=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function render(files,warnings){$("resultsPanel").hidden=false;$("reportCount").textContent=files+" file"+(files===1?"":"s");
 const active=records.filter(x=>x.source==="Active"),sold=records.filter(x=>x.source==="Order"),draft=records.filter(x=>x.source==="Draft");
 $("activeCount").textContent=active.length;$("soldCount").textContent=sold.length;$("draftCount").textContent=draft.length;
 $("itemIdCount").textContent=new Set(records.filter(x=>!x.id.startsWith("Draft ")).map(x=>x.id).filter(Boolean)).size;
 $("warnings").innerHTML=warnings.length?'<p class="import-note">'+warnings.map(esc).join("<br>")+"</p>":"";
 $("previewRows").innerHTML=records.map(r=>'<tr><td>'+esc(r.source)+'</td><td>'+esc(r.id)+'</td><td>'+esc(r.title)+'</td><td>'+esc(r.status)+'</td><td>$'+r.price.toFixed(2)+'</td><td>'+esc(r.sku||"—")+'</td><td>'+esc(r.action)+'</td></tr>').join("");
}
$("ebayFiles").addEventListener("change",async e=>{records=[];const warnings=[];let files=0;for(const f of e.target.files){const rows=csvRows(await f.text()),d=detect(rows);if(!d){warnings.push(f.name+": report type not recognized; nothing imported.");continue}const os=objects(rows,d.header);os.forEach((o,i)=>records.push(normalize(d.type,o,i)));files++;}render(files,warnings);});
