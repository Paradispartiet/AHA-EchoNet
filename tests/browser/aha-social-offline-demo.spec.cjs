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
 await expect(social.getByRole("button",{name:"Rapporter"})).toBeVisible();
 await expect(social.getByRole("button",{name:"Slett"})).toHaveCount(0);
 await social.getByRole("button",{name:/Lik \(/}).click();
 await expect(social.getByRole("button",{name:/Likt \(1\)/})).toBeVisible();
 await page.getByRole("button",{name:"Konto A"}).click();
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
