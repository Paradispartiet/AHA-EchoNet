const {test,expect}=require("@playwright/test");

test("offline iPad/Chromium preview exercises real Feed UI with two simulated accounts and no backend",async({page})=>{
 const external=[];
 page.on("request",request=>{if(request.url().includes("aha-social-offline-demo.invalid"))external.push(request.url());});
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 await expect(page.getByRole("heading",{name:"Prøv AHA Feed og Insta på iPad"})).toBeVisible();
 await expect(page.getByText("Dette er en interaktiv simulering, ikke en ekte publisering.")).toBeVisible();
 const social=page.locator("#aha-social-mount");
 await expect(social.getByRole("heading",{name:"Delte oppdateringer"})).toBeVisible();
 await expect(social.locator(".aha-social-status")).toContainText("0 delte innlegg");
 await social.locator("textarea").first().fill("Testpost i lokal forhåndsvisning");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Feed"}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Testpost i lokal forhåndsvisning");
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(page.locator("#demo-account-b")).toHaveAttribute("aria-pressed","true");
 await expect(social.locator(".aha-social-post")).toContainText("Testpost i lokal forhåndsvisning");
 await expect(social.getByRole("button",{name:"Rapporter"})).toHaveCount(0);
 await expect(social.getByRole("button",{name:"Slett"})).toHaveCount(0);
 await social.locator(".aha-social-more summary").click();
 await expect(social.getByRole("button",{name:"Rapporter"})).toBeVisible();
 await social.locator(".aha-social-more summary").click();
 await social.getByRole("button",{name:/Lik \(/}).click();
 await expect(social.getByRole("button",{name:/Likt \(1\)/})).toBeVisible();
 await page.getByRole("button",{name:"Konto A"}).click();
 await expect(social.getByRole("button",{name:"Slett"})).toHaveCount(0);
 await social.locator(".aha-social-more summary").click();
 await expect(social.getByRole("button",{name:"Slett"})).toBeVisible();
 page.once("dialog",dialog=>dialog.accept());
 await social.getByRole("button",{name:"Slett"}).click();
 await expect(social.locator(".aha-social-status")).toContainText("0 delte innlegg");
 expect(external).toHaveLength(0);
});

test("offline iPad/Chromium preview handles local picture and account visibility without uploads",async({page})=>{
 const external=[];
 page.on("request",request=>{if(request.url().includes("aha-social-offline-demo.invalid"))external.push(request.url());});
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 await expect(social.getByRole("heading",{name:"Delte bilder og videoer"})).toBeVisible();
 const bytes=await page.evaluate(async()=>{
  const c=document.createElement("canvas");c.width=100;c.height=100;
  const ctx=c.getContext("2d");ctx.fillStyle="#283d65";ctx.fillRect(0,0,100,100);
  const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"demo.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await expect(social.getByAltText("Lokal forhåndsvisning av bildet")).toBeVisible();
 await social.locator("textarea").first().fill("Bilde fra iPad-demo");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Bilde fra iPad-demo");
 await expect(social.locator(".aha-social-post img")).toHaveAttribute("src",/^blob:/);
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.locator(".aha-social-post img")).toHaveAttribute("src",/^blob:/);
 await page.getByRole("button",{name:"Nullstill"}).click();
 await expect(social.locator(".aha-social-post")).toHaveCount(0);
 expect(external).toHaveLength(0);
});

test("Feed counts toward 500 characters and Insta is image-first with mode and location",async({page})=>{
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 const feed=page.locator("#aha-social-mount");
 const input=feed.locator("textarea").first();
 await expect(input).toHaveAttribute("maxlength","500");
 await expect(feed.locator(".aha-social-counter")).toHaveText("0 / 500");
 await input.fill("a".repeat(500));
 await expect(feed.locator(".aha-social-counter")).toHaveText("500 / 500");
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const insta=page.locator("#aha-social-mount");
 await expect(insta.locator('input[type="file"]')).toHaveCount(1);
 await expect(insta.getByRole("button",{name:"Feed",exact:true})).toHaveAttribute("aria-pressed","true");
 await insta.getByRole("button",{name:"Map",exact:true}).click();
 await expect(insta.getByRole("button",{name:"Map",exact:true})).toHaveAttribute("aria-pressed","true");
 await expect(insta.locator('input[type="text"][maxlength="120"]')).toBeVisible();
 await insta.getByRole("button",{name:"Reel",exact:true}).click();
 await expect(insta.getByRole("button",{name:"Reel",exact:true})).toHaveAttribute("aria-pressed","true");
});


test("Insta Map retains the photo location and filters the view across demo accounts",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=160;c.height=90;
   const cx=c.getContext("2d");cx.fillStyle="#2251aa";cx.fillRect(0,0,160,90);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({
   name:"oslo.png",mimeType:"image/png",buffer:Buffer.from(bytes)
 });
 await social.getByRole("button",{name:"Map",exact:true}).click();
 await social.locator('input[type="text"][maxlength="120"]').fill("Oslo sentrum");
 await social.locator("textarea").first().fill("Bilde fra sentrum");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Bilde fra sentrum");
 await expect(social.locator(".aha-social-location")).toContainText("Oslo sentrum");
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.locator(".aha-social-location")).toContainText("Oslo sentrum");
 await social.getByRole("button",{name:"Reel",exact:true}).click();
 await expect(social.locator(".aha-social-post")).toHaveCount(0);
 await social.getByRole("button",{name:"Feed",exact:true}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Bilde fra sentrum");
});


test("Map browsing is separate from the publish type and place tags can filter posts",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=160;c.height=100;
   c.getContext("2d").fillRect(0,0,160,100);
   const blob=await new Promise(r=>c.toBlob(r,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"tagged.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await social.getByRole("button",{name:"Map",exact:true}).click();
 await social.locator('input[type="text"][maxlength="120"]').fill("Oslo sentrum");
 await social.locator("textarea").first().fill("Et stedstaggede bilde");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-place-group")).toContainText("Oslo sentrum");
 const publishMap=social.getByRole("button",{name:"Map",exact:true});
 await expect(publishMap).toHaveAttribute("aria-pressed","true");
 await social.getByRole("button",{name:"Vis Feed"}).click();
 await expect(publishMap).toHaveAttribute("aria-pressed","true");
 await expect(social.locator(".aha-social-post")).toContainText("Et stedstaggede bilde");
 await social.getByRole("button",{name:"Se bilder fra Oslo sentrum"}).click();
 await expect(social.getByRole("button",{name:"Vis Map"})).toHaveAttribute("aria-pressed","true");
 await expect(social.getByRole("searchbox",{name:"Søk etter stedstag"})).toHaveValue("Oslo sentrum");
 await expect(social.locator(".aha-social-place-group")).toHaveCount(1);
 await social.getByRole("searchbox",{name:"Søk etter stedstag"}).fill("Tromsø");
 await expect(social.locator(".aha-social-post")).toHaveCount(0);
 await expect(social.locator(".aha-social-list")).toContainText("Ingen bilder funnet");
 await social.getByRole("searchbox",{name:"Søk etter stedstag"}).fill("OSLO");
 await expect(social.locator(".aha-social-place-group")).toContainText("Oslo sentrum");
});


test("published Insta images can be tagged by owner, viewed by B, and never edited by B",async({page})=>{
 const calls=[];
 page.on("request",request=>{if(request.url().includes("aha-social-offline-demo.invalid"))calls.push(request.url());});
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=180;c.height=110;
   const cx=c.getContext("2d");cx.fillStyle="#365ab5";cx.fillRect(0,0,180,110);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"owner-image.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await social.locator("textarea").first().fill("Et bilde som tagges senere");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Et bilde som tagges senere");
 await expect(social.locator(".aha-social-location")).toHaveCount(0);
 await social.locator(".aha-social-more summary").click();
 await social.getByRole("button",{name:"Legg til stedstag"}).click();
 const edit=social.locator(".aha-social-place-editor");
 await expect(edit).toBeVisible();
 await edit.getByRole("textbox",{name:"Stedstag for dette bildet"}).fill("  Oslo, Frogner  ");
 await edit.getByRole("button",{name:"Lagre stedstag"}).click();
 await expect(social.locator(".aha-social-location")).toContainText("Oslo, Frogner");
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.locator(".aha-social-location")).toContainText("Oslo, Frogner");
 await expect(social.getByRole("button",{name:"Rediger stedstag"})).toHaveCount(0);
 await page.getByRole("button",{name:"Konto A"}).click();
 await social.locator(".aha-social-more summary").click();
 await social.getByRole("button",{name:"Rediger stedstag"}).click();
 await edit.getByRole("textbox",{name:"Stedstag for dette bildet"}).fill("");
 await edit.getByRole("button",{name:"Lagre stedstag"}).click();
 await expect(social.locator(".aha-social-location")).toHaveCount(0);
 expect(calls).toHaveLength(0);
});

test("Map posts cannot lose mandatory place tags during post-publication editing",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
  const c=document.createElement("canvas");c.width=180;c.height=100;
  c.getContext("2d").fillRect(0,0,180,100);
  const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"map.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await social.getByRole("button",{name:"Map",exact:true}).click();
 await social.locator('input[type="text"][maxlength="120"]').fill("Oslo sentrum");
 await social.locator("textarea").first().fill("Map bilde med plassering");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await social.locator(".aha-social-more summary").click();
 await social.getByRole("button",{name:"Rediger stedstag"}).click();
 const editor=social.locator(".aha-social-place-editor");
 await editor.getByRole("textbox",{name:"Stedstag for dette bildet"}).fill("");
 await editor.getByRole("button",{name:"Lagre stedstag"}).click();
 await expect(social.locator(".aha-social-status")).toContainText("Map-innlegg må ha et stedstag");
 await expect(social.locator(".aha-social-location")).toContainText("Oslo sentrum");
 await editor.getByRole("textbox",{name:"Stedstag for dette bildet"}).fill("Bergen");
 await editor.getByRole("button",{name:"Lagre stedstag"}).click();
 await expect(social.locator(".aha-social-location")).toContainText("Bergen");
});


test("Reel previews and publishes selected MP4 only in the local in-memory demo",async({page})=>{
 const outbound=[];
 page.on("request",r=>{if(r.url().includes("aha-social-offline-demo.invalid"))outbound.push(r.url());});
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const picker=social.locator('input[type="file"]');
 await expect(picker).toHaveAttribute("accept","image/*");
 await social.getByRole("button",{name:"Reel",exact:true}).click();
 await expect(picker).toHaveAttribute("accept",/video\/mp4/);
 // The inert binary tests transport, DOM preview and authorization boundaries,
 // not codec decoding. Real playback can be tested with a real iPad clip.
 const bytes=Buffer.alloc(256,0);
 bytes.write("ftypisom",4,"ascii");
 await picker.setInputFiles({name:"reel-preview.mp4",mimeType:"video/mp4",buffer:bytes});
 const preview=social.locator("video.aha-social-reel-preview");
 await expect(preview).toBeVisible();
 await expect(preview).toHaveAttribute("src",/^blob:/);
 await expect(preview).toHaveAttribute("controls","");
 await social.locator("textarea").first().fill("Videoreel på iPad-demo");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-post")).toContainText("Videoreel på iPad-demo");
 await expect(social.locator(".aha-social-post video")).toHaveAttribute("src",/^blob:/);
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.locator(".aha-social-post video")).toHaveAttribute("src",/^blob:/);
 await social.getByRole("button",{name:"Vis Reel"}).click();
 await expect(social.locator(".aha-social-post")).toHaveCount(1);
 await page.getByRole("button",{name:"Nullstill"}).click();
 await expect(social.locator(".aha-social-post")).toHaveCount(0);
 expect(outbound).toHaveLength(0);
});

test("leaving Reel clears a selected video without uploading or publishing",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 await social.getByRole("button",{name:"Reel",exact:true}).click();
 const picker=social.locator('input[type="file"]');
 await picker.setInputFiles({name:"clip.webm",mimeType:"video/webm",buffer:Buffer.alloc(256,1)});
 await expect(social.locator("video.aha-social-reel-preview")).toBeVisible();
 await social.getByRole("button",{name:"Map",exact:true}).click();
 await expect(picker).toHaveAttribute("accept","image/*");
 await expect(social.locator("video.aha-social-reel-preview")).toBeHidden();
 expect(await picker.evaluate(el=>el.files.length)).toBe(0);
 await expect(social.locator(".aha-social-post")).toHaveCount(0);
});


test("Insta publishes an image without forcing caption text, Feed still requires its text",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=120;c.height=120;
   c.getContext("2d").fillRect(0,0,120,120);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"no-caption.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await expect(social.locator("textarea").first()).not.toHaveAttribute("required","");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 await expect(social.locator(".aha-social-post img")).toHaveAttribute("src",/^blob:/);
 await expect(social.locator(".aha-social-post")).toHaveCount(1);
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.locator(".aha-social-post img")).toHaveAttribute("src",/^blob:/);
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 await expect(page.locator("#aha-social-mount textarea").first()).toHaveAttribute("required","");
});


test("social design keeps X-style Feed text after author and Instagram media before actions and caption",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 await expect(social.locator(".aha-social-masthead")).toBeVisible();
 await expect(social.locator(".aha-social-navigation a[aria-current='page']")).toHaveText("Feed");
 await expect(social.locator(".aha-social-compose-lead .aha-social-avatar")).toBeVisible();
 await social.locator("textarea").first().fill("Tidslinje med 500 tegn");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Feed"}).click();
 const feedCard=social.locator(".aha-social-post").first();
 await expect(feedCard.locator(".aha-social-avatar")).toBeVisible();
 const feedOrder=await feedCard.evaluate(card=>Array.from(card.children).map(el=>el.classList.contains("aha-social-post-head")?"head":el.classList.contains("aha-social-feed-copy")?"text":el.classList.contains("aha-social-actions")?"actions":"other"));
 expect(feedOrder.indexOf("head")).toBeLessThan(feedOrder.indexOf("text"));
 expect(feedOrder.indexOf("text")).toBeLessThan(feedOrder.indexOf("actions"));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const insta=page.locator("#aha-social-mount");
 await expect(insta.locator(".aha-social-navigation a[aria-current='page']")).toHaveText("Insta");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=180;c.height=120;
   const cx=c.getContext("2d");cx.fillStyle="#6677bd";cx.fillRect(0,0,180,120);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await insta.locator('input[type="file"]').setInputFiles({name:"social-design.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await insta.locator("textarea").first().fill("Bilde før tekst");
 await insta.getByRole("checkbox").check();
 await insta.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 const instaCard=insta.locator(".aha-social-post").first();
 await expect(instaCard.locator("header .aha-social-avatar")).toBeVisible();
 await expect(instaCard.locator("img.aha-social-media")).toHaveAttribute("src",/^blob:/);
 const order=await instaCard.evaluate(card=>Array.from(card.children).map(el=>
   el.classList.contains("aha-social-post-head")?"head":
   el.classList.contains("aha-social-media")?"media":
   el.classList.contains("aha-social-actions")?"actions":
   el.classList.contains("aha-social-caption")?"caption":"other"));
 expect(order.indexOf("head")).toBeLessThan(order.indexOf("media"));
 expect(order.indexOf("media")).toBeLessThan(order.indexOf("actions"));
 expect(order.indexOf("actions")).toBeLessThan(order.indexOf("caption"));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
 await page.setViewportSize({width:834,height:1112});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
});


test("Insta full-screen image viewer works by touch and keyboard, without second network fetch",async({page})=>{
 const external=[];
 page.on("request",request=>{if(request.url().includes("aha-social-offline-demo.invalid"))external.push(request.url());});
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const pixels=await page.evaluate(async()=>{
  const canvas=document.createElement("canvas");canvas.width=180;canvas.height=140;
  const ctx=canvas.getContext("2d");ctx.fillStyle="#4a71bc";ctx.fillRect(0,0,180,140);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"view.png",mimeType:"image/png",buffer:Buffer.from(pixels)});
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 const picture=social.locator(".aha-social-post img.aha-social-media");
 await expect(picture).toHaveAttribute("src",/^blob:/);
 await picture.click();
 const dialog=social.getByRole("dialog",{name:"Bildevisning"});
 await expect(dialog).toBeVisible();
 await expect(dialog.locator("img")).toHaveAttribute("src",/^blob:/);
 await dialog.getByRole("button",{name:"Lukk bildet"}).click();
 await expect(dialog).toBeHidden();
 await picture.focus();
 await page.keyboard.press("Enter");
 await expect(dialog).toBeVisible();
 await page.keyboard.press("Escape");
 await expect(dialog).toBeHidden();
 expect(external).toHaveLength(0);
});

test("Feed comments are collapsed by default and can be opened and closed",async({page})=>{
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 await social.locator("textarea").first().fill("Kommentarene åpnes ved behov");
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Feed"}).click();
 const card=social.locator(".aha-social-post").first();
 const button=card.getByRole("button",{name:"Kommentarer (0)"});
 await expect(button).toHaveAttribute("aria-expanded","false");
 await expect(card.locator(".aha-social-comments")).toBeHidden();
 await button.click();
 await expect(button).toHaveAttribute("aria-expanded","true");
 await expect(card.locator(".aha-social-comments")).toBeVisible();
 await expect(card.getByPlaceholder("Skriv en kommentar")).toBeVisible();
 await button.click();
 await expect(button).toHaveAttribute("aria-expanded","false");
 await expect(card.locator(".aha-social-comments")).toBeHidden();
});


test("Feed and Insta keep only primary actions visible, with owner-only overflow tools",async({page})=>{
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 const feed=page.locator("#aha-social-mount");
 await feed.locator("textarea").first().fill("En ryddig X-lignende tidslinje");
 await feed.getByRole("checkbox").check();
 await feed.getByRole("button",{name:"Publiser i AHA Feed"}).click();
 const card=feed.locator(".aha-social-post").first();
 await expect(card.locator(".aha-social-actions button")).toHaveCount(2);
 await expect(card.getByRole("button",{name:"Slett"})).toHaveCount(0);
 await card.locator(".aha-social-more summary").click();
 await expect(card.getByRole("button",{name:"Slett"})).toBeVisible();
 await page.getByRole("button",{name:"Konto B"}).click();
 const visitor=feed.locator(".aha-social-post").first();
 await expect(visitor.getByRole("button",{name:"Slett"})).toHaveCount(0);
 await visitor.locator(".aha-social-more summary").click();
 await expect(visitor.getByRole("button",{name:"Rapporter"})).toBeVisible();
 await expect(visitor.getByRole("button",{name:"Rediger stedstag"})).toHaveCount(0);
});

test("Insta owner can edit a place tag through the overflow menu without altering the media",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const social=page.locator("#aha-social-mount");
 const bytes=await page.evaluate(async()=>{
   const c=document.createElement("canvas");c.width=150;c.height=100;
   c.getContext("2d").fillRect(0,0,150,100);
   const blob=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
   return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await social.locator('input[type="file"]').setInputFiles({name:"place.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await social.getByRole("checkbox").check();
 await social.getByRole("button",{name:"Publiser i AHA Insta"}).click();
 const card=social.locator(".aha-social-post").first();
 const photo=card.locator("img.aha-social-media");
 await expect(photo).toHaveAttribute("src",/^blob:/);
 const initial=await photo.getAttribute("src");
 await expect(card.locator(".aha-social-actions button")).toHaveCount(2);
 await expect(card.getByRole("button",{name:"Legg til stedstag"})).toHaveCount(0);
 await card.locator(".aha-social-more summary").click();
 await card.getByRole("button",{name:"Legg til stedstag"}).click();
 await expect(card.locator(".aha-social-more")).not.toHaveAttribute("open","");
 await card.getByRole("textbox",{name:"Stedstag for dette bildet"}).fill("Oslo");
 await card.getByRole("button",{name:"Lagre stedstag"}).click();
 await expect(social.locator(".aha-social-location")).toContainText("Oslo");
 await expect(social.locator(".aha-social-post img.aha-social-media")).toHaveAttribute("src",/^blob:/);
 await page.getByRole("button",{name:"Konto B"}).click();
 await expect(social.getByRole("button",{name:"Legg til stedstag"})).toHaveCount(0);
 await expect(social.getByRole("button",{name:"Rediger stedstag"})).toHaveCount(0);
});


test("Feed composer enables publish only after non-empty text and explicit sharing",async({page})=>{
 await page.goto("/social-demo.html?vis=feed",{waitUntil:"domcontentloaded"});
 const ui=page.locator("#aha-social-mount");
 const send=ui.getByRole("button",{name:"Publiser i AHA Feed"});
 const text=ui.locator("textarea").first();
 await expect(send).toBeDisabled();
 await text.fill("Testinnlegg");
 await expect(send).toBeDisabled();
 await ui.getByRole("checkbox").check();
 await expect(send).toBeEnabled();
 await ui.getByRole("checkbox").uncheck();
 await expect(send).toBeDisabled();
 await ui.getByRole("checkbox").check();
 await text.fill("    ");
 await expect(send).toBeDisabled();
 await text.fill("a".repeat(500));
 await expect(send).toBeEnabled();
 await expect(ui.locator(".aha-social-counter")).toHaveText("500 / 500");
 await send.click();
 await expect(send).toBeDisabled();
 await expect(ui.locator(".aha-social-post")).toContainText("a".repeat(40));
});

test("Insta image-first composer requires media, consent and location only for Map",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const ui=page.locator("#aha-social-mount");
 const send=ui.getByRole("button",{name:"Publiser i AHA Insta"});
 await expect(send).toBeDisabled();
 await ui.getByRole("checkbox").check();
 await expect(send).toBeDisabled();
 const pixels=await page.evaluate(async()=>{
  const c=document.createElement("canvas");c.width=130;c.height=130;
  c.getContext("2d").fillRect(0,0,130,130);
  const blob=await new Promise(r=>c.toBlob(r,"image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await ui.locator('input[type="file"]').setInputFiles({name:"simple.png",mimeType:"image/png",buffer:Buffer.from(pixels)});
 await expect(send).toBeEnabled();
 await ui.getByRole("button",{name:"Map",exact:true}).click();
 await expect(send).toBeDisabled();
 await ui.locator('input[type="text"][maxlength="120"]').fill("Oslo");
 await expect(send).toBeEnabled();
 await ui.getByRole("button",{name:"Fjern valgt bilde"}).click();
 await expect(send).toBeDisabled();
 await expect(ui.getByRole("checkbox")).not.toBeChecked();
});


test("private Insta draft can always discard its photo before consent or caption",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const ui=page.locator("#aha-social-mount");
 const send=ui.getByRole("button",{name:"Publiser i AHA Insta"});
 const discard=ui.getByRole("button",{name:"Fjern valgt bilde"});
 const preview=ui.getByAltText("Lokal forhåndsvisning av bildet");
 const bytes=await page.evaluate(async()=>{
  const canvas=document.createElement("canvas");canvas.width=120;canvas.height=120;
  canvas.getContext("2d").fillRect(0,0,120,120);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
  return Array.from(new Uint8Array(await blob.arrayBuffer()));
 });
 await ui.locator('input[type="file"]').setInputFiles({name:"draft.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await expect(preview).toBeVisible();
 await expect(discard).toBeEnabled();
 await expect(send).toBeDisabled();
 await discard.click();
 await expect(preview).toBeHidden();
 await expect(discard).toBeDisabled();
 await expect(send).toBeDisabled();
 await expect(ui.getByRole("checkbox")).not.toBeChecked();
 await expect(ui.locator(".aha-social-post")).toHaveCount(0);
 expect(await ui.locator('input[type="file"]').evaluate(input=>input.files.length)).toBe(0);
});

test("Insta image-first picker shrinks when a photo is selected and resets on discard",async({page})=>{
 await page.goto("/social-demo.html?vis=insta",{waitUntil:"domcontentloaded"});
 const ui=page.locator("#aha-social-mount");
 const picker=ui.locator('input[type="file"]');
 const pickerLabel=ui.locator('.aha-social-compose label:has(> input[type="file"])');
 const initial=await pickerLabel.evaluate(el=>el.getBoundingClientRect().height);
 const bytes=await page.evaluate(async()=>{
  const c=document.createElement("canvas");c.width=140;c.height=110;
  c.getContext("2d").fillRect(0,0,140,110);
  const b=await new Promise(resolve=>c.toBlob(resolve,"image/png"));
  return Array.from(new Uint8Array(await b.arrayBuffer()));
 });
 await picker.setInputFiles({name:"test.png",mimeType:"image/png",buffer:Buffer.from(bytes)});
 await expect(ui.getByAltText("Lokal forhåndsvisning av bildet")).toBeVisible();
 const selected=await pickerLabel.evaluate(el=>el.getBoundingClientRect().height);
 expect(selected).toBeLessThan(initial-50);
 await ui.getByRole("button",{name:"Fjern valgt bilde"}).click();
 await expect(ui.getByAltText("Lokal forhåndsvisning av bildet")).toBeHidden();
 const restored=await pickerLabel.evaluate(el=>el.getBoundingClientRect().height);
 expect(restored).toBeGreaterThan(selected+50);
});
