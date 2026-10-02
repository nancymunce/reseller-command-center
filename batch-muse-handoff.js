/* Batch Muse handoff — zero-cost batch drafts.
   One request covers every unprepared item group; one reply from Muse
   creates one Master Draft per group. Nancy alone publishes to eBay. */
(function(){
"use strict";
var BS="---COMMAND-CENTER-RESULT", BE="---END-COMMAND-CENTER-RESULT---";
var FIELDS=["Title","Brand","Category","Condition","Price","Item specifics","Description","Research notes"];
var snapshot=[];      // [{key,count}] captured when the request is built, in item order
var parsedBlocks=null; // [{n,fields}] parsed from Muse's reply

function $(x){return document.getElementById(x);}
function esc(x){return String(x==null?"":x).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
function msg(x){ if(typeof toast==="function") toast(x); else alert(x); }

/* Groups with no prepared draft yet, in current display order. */
function pendingGroups(){
  try{
    var groups=currentBatchGroupIndexes().filter(function(g){return g&&g.length;});
    return groups.map(function(g){return {indexes:g,key:batchGroupKey(g)};})
      .filter(function(x){var p=batchPreparationState.get(x.key);return !(p&&p.status==="created");});
  }catch(e){ return []; }
}

function noteValues(){
  var out=[];
  document.querySelectorAll(".batch-muse-note").forEach(function(inp){ out[Number(inp.dataset.idx)]=inp.value.trim(); });
  return out;
}

function buildRequest(){
  var groups=pendingGroups();
  if(!groups.length){ msg("No unprepared item groups right now."); return; }
  snapshot=groups.map(function(x){return {key:x.key,count:x.indexes.length};});
  var notesBox=$("batchMuseNotes");
  notesBox.innerHTML=groups.map(function(x,idx){
    var thumbs=x.indexes.slice(0,4).map(function(pi){
      var f=batchListingPhotos[pi];
      return f?'<img src="'+photoObjectUrl(f)+'" alt="Item '+(idx+1)+' photo">':"";
    }).join("");
    return '<div class="batch-muse-note-row"><div class="batch-muse-note-thumbs">'+thumbs+'</div>'+
      '<label><strong>Item '+(idx+1)+'</strong> <span class="muted">· '+x.indexes.length+' photo'+(x.indexes.length===1?"":"s")+'</span>'+
      '<input class="batch-muse-note" data-idx="'+idx+'" placeholder="Cost, source, flaws — anything Muse should know"></label></div>';
  }).join("");
  notesBox.querySelectorAll(".batch-muse-note").forEach(function(inp){
    inp.addEventListener("input",updateRequestText);
  });
  $("batchMuseCount").textContent=groups.length+" item"+(groups.length===1?"":"s");
  updateRequestText();
  $("batchMusePanel").scrollIntoView({behavior:"smooth",block:"start"});
  msg("Batch request built for "+groups.length+" items.");
}

function updateRequestText(){
  if(!snapshot.length) return;
  var notes=noteValues();
  var total=snapshot.reduce(function(a,s){return a+s.count;},0);
  var lines=[];
  lines.push("RESELLER COMMAND CENTER — BATCH LISTING DRAFT JOB");
  lines.push("");
  lines.push("I am attaching "+total+" photos covering "+snapshot.length+" items. They are in item order:");
  var photoNum=0;
  snapshot.forEach(function(s,idx){
    var start=photoNum+1, end=photoNum+s.count; photoNum=end;
    lines.push("- Item "+(idx+1)+": photos "+start+"-"+end+" ("+s.count+" photo"+(s.count===1?"":"s")+")");
  });
  lines.push("");
  lines.push("What I know about each item:");
  snapshot.forEach(function(s,idx){
    lines.push("- Item "+(idx+1)+": "+(notes[idx]||"(nothing recorded)"));
  });
  lines.push("");
  lines.push("For EACH item: examine its photos. Identify only from visible evidence. Research comparable SOLD listings from public web sources when available. Prepare an eBay-ready title, description, category, condition, brand, and competitive price. Never invent unsupported details. Never expose cost, source, or storage location in public copy.");
  lines.push("");
  lines.push("IMPORTANT: Do NOT access, log into, browse, edit, or publish to eBay. Nancy alone handles eBay. These are drafts for review and later inclusion in a Nancy-uploaded eBay file.");
  lines.push("");
  lines.push("End with one result block PER item, numbered to match the items above, in this exact format. Format Item specifics as Field=Value pairs separated by |.");
  snapshot.forEach(function(s,idx){
    lines.push(BS+" "+(idx+1)+"---");
    FIELDS.forEach(function(f){ lines.push(f+": "); });
    lines.push(BE);
  });
  $("batchMuseRequestText").value=lines.join("\n");
}

function copyRequest(){
  var t=$("batchMuseRequestText");
  if(!t||!t.value){ msg("Build the batch request first."); return; }
  function done(){ msg("Batch request copied — attach the photos to Muse in item order."); }
  function fallback(){ t.select(); try{document.execCommand("copy");}catch(e){} done(); }
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(t.value).then(done,function(){fallback();});
  } else fallback();
}

function parseFields(block){
  var o={},k=null;
  FIELDS.forEach(function(f){o[f]="";});
  String(block||"").split(/\r?\n/).forEach(function(raw){
    var line=raw.trim(),m=line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
    if(m&&FIELDS.includes(m[1])){k=m[1];o[k]=m[2].trim();}
    else if(k&&line){o[k]+="\n"+line;}
  });
  return o;
}

function parseResults(){
  var text=String($("batchMuseResultText").value||"");
  var re=/---COMMAND-CENTER-RESULT\s*(\d+)\s*---([\s\S]*?)---END-COMMAND-CENTER-RESULT---/g;
  var m,blocks=[];
  while((m=re.exec(text))){ blocks.push({n:Number(m[1]),fields:parseFields(m[2])}); }
  blocks.sort(function(a,b){return a.n-b.n;});
  parsedBlocks=blocks;
  var prev=$("batchMuseResultPreview"),btn=$("createBatchDraftsBtn");
  btn.disabled=true;
  if(!blocks.length){
    prev.hidden=false;
    prev.innerHTML='<p class="muted">No numbered result blocks found. Muse must return one '+esc(BS)+' N--- block per item.</p>';
    return;
  }
  var missing=[];
  for(var i=1;i<=snapshot.length;i++){
    if(!blocks.some(function(b){return b.n===i;})) missing.push(i);
  }
  prev.hidden=false;
  prev.innerHTML=blocks.map(function(b){
    var f=b.fields;
    return '<h4>Item '+b.n+(f.Title?" — "+esc(f.Title):"")+'</h4>'+
      '<table class="muse-result-table"><tbody>'+
      FIELDS.map(function(k){
        return "<tr><th>"+esc(k)+"</th><td>"+esc(f[k]||"—").replaceAll("\n","<br>")+"</td></tr>";
      }).join("")+"</tbody></table>";
  }).join("")+(missing.length?'<p class="muted"><strong>Missing blocks for item(s):</strong> '+missing.join(", ")+". The create button stays disabled until every item has a block.</p>":"");
  var ok=missing.length===0&&blocks.length===snapshot.length;
  btn.disabled=!ok;
  msg(ok?blocks.length+" item drafts parsed — review, then create.":"Parsed "+blocks.length+" of "+snapshot.length+" — still missing item(s) "+missing.join(", ")+".");
}

function priceNum(x){var n=Number(String(x||"").replace(/[^0-9.]/g,""));return Number.isFinite(n)?n:0;}
function specificsObj(x){
  var out={};
  String(x||"").split("|").forEach(function(part){
    var p=part.indexOf("="); if(p<1)p=part.indexOf(":"); if(p<1)return;
    var k=part.slice(0,p).trim(),v=part.slice(p+1).trim();
    if(k&&v)out[k]=v;
  });
  return out;
}

async function createDrafts(){
  if(!parsedBlocks||!parsedBlocks.length) return;
  var groups=pendingGroups();
  var unchanged=groups.length===snapshot.length&&groups.every(function(g,i){return g.key===snapshot[i].key;});
  if(!unchanged){
    alert("The item groups changed since the request was copied (photos were regrouped or a draft was prepared). Rebuild the batch request and try again — no drafts were created.");
    return;
  }
  var btn=$("createBatchDraftsBtn");
  btn.disabled=true; btn.textContent="Creating…";
  var created=0,failures=[];
  try{
    for(var bi=0;bi<parsedBlocks.length;bi++){
      var b=parsedBlocks[bi],g=groups[bi],f=b.fields;
      var files=g.indexes.map(function(pi){return batchListingPhotos[pi];}).filter(Boolean);
      if(!files.length){ failures.push("Item "+b.n+": no photos found"); continue; }
      var id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+"-"+bi;
      var paths=[];
      try{
        if(typeof uploadListingPhotos==="function") paths=await uploadListingPhotos(id,files);
        var item={id:id,title:f.Title||("Batch Item "+b.n),brand:f.Brand||"",category:f.Category||"",
          purchaseCost:0,costStatus:"unknown",purchaseDate:"",source:"",storage:"",status:"Unlisted",
          listPrice:priceNum(f.Price),listedMarketplaces:[],saleMarketplace:"",saleDate:"",salePrice:0,
          shippingCollected:0,fees:0,shippingCost:0,otherExpenses:0,notes:"",
          listingDescription:f.Description||"",itemCondition:f.Condition||"",researchNotes:f["Research notes"]||"",
          draftStatus:"draft",ebayCategoryId:"",ebayConditionId:"",ebayItemSpecifics:specificsObj(f["Item specifics"]),
          listingPhotoPaths:paths};
        var saved=await saveCloudItem(item);
        items.unshift(saved);
        batchPreparationState.set(g.key,{status:"created",item:saved});
        created++;
      }catch(e){
        if(paths.length&&typeof removeListingPhotoFiles==="function"){
          try{await removeListingPhotoFiles(paths);}catch(rb){console.error("Could not roll back batch draft photos",rb);}
        }
        failures.push("Item "+b.n+": "+((e&&e.message)||"save failed"));
      }
    }
  }finally{
    btn.disabled=false; btn.textContent="Create Master Drafts";
  }
  renderAll(); renderBatchIntake();
  parsedBlocks=null; snapshot=[];
  $("batchMuseResultText").value=""; $("batchMuseResultPreview").hidden=true;
  $("batchMuseNotes").innerHTML=""; $("batchMuseRequestText").value="";
  $("batchMuseCount").textContent="";
  if(failures.length) alert(created+" draft(s) created. Failures:\n"+failures.join("\n"));
  else msg(created+" Master Drafts created — nothing was published.");
  if(typeof showView==="function") showView("master-drafts");
}

function init(){
  if(!$("buildBatchMuseRequestBtn")) return;
  $("buildBatchMuseRequestBtn").addEventListener("click",buildRequest);
  $("copyBatchMuseRequestBtn")?.addEventListener("click",copyRequest);
  $("parseBatchMuseResultsBtn")?.addEventListener("click",parseResults);
  $("createBatchDraftsBtn")?.addEventListener("click",createDrafts);
  $("batchMuseJumpBtn")?.addEventListener("click",function(){
    buildRequest();
  });
}
document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
