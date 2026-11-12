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
