# Focama
intent: an app where the user can enter in a product description and receive a choice of items which when tapped on or clicked the user is directed to Amazon with an affliate link.
purpose: Amazon has specifically designed their site to be as "sticky" as possible to encourage friction and thereby engagement. This is against what the Rabbis want and what the idea of TAG is supposed to minimize. Users who value their sense of focus want to be able to search and buy what they want without distraction. Furthermore, frum consumers do not like the standards of modesty of Amazon so this can be avoided in this app.

## Amazon compliance notes
- Use the exact Amazon Associates website disclosure text somewhere clear on the site: `As an Amazon Associate I earn from qualifying purchases.`
- Keep the disclosure clear and conspicuous, not hidden in a footer-only placement or buried in legal text.
- Put a disclosure near affiliate CTAs / affiliate links as well, since Amazon expects disclosures to be adjacent to where users engage with the link.
- If social/account surfaces are added later, add the required affiliate disclosure in the associated profile/account context too.
- If live Amazon pricing, availability, discounts, or Prime-related data are shown later, verify and add any additional adjacent Amazon-required disclaimers for that content before launch.
- Before connecting the live Amazon Creator / affiliate / product APIs, re-check Amazon's latest Operating Agreement and help docs because these requirements can change.
- Future UX and copy decisions should preserve trust and compliance: no misleading wording that could hide the affiliate relationship.

## flow of app
1.user arrives at a screen with a input with a placeholder prompting them to search for a product e.g. "lego" and " for a 9 year old boy who enjoys imagination" see ui section for more details.the user hits send
2. first a call to amazon api will return the choices.
3. then a call to chatgpt (we need to figure out which version is best for price/response and which can be upgraded for paying users). there will need to be instructions about what is acceptable for us. the main point is that ChatGPT should filter out the most relevant results and provide diverse choices, i.e. diffferent price points or other diferentiaters. then based on relevance and stars it should give back an array indexed based on priority.
4. then take the first 4 choices and show them to the user.
5. an affilate link should be generated and used when thenuser selects a choice.

*there are more features to come this is v1*

## ui
- the overall feeling should be one of calm and focus. This directly as opposed to the feeling Amazon gives.
- there will be a feature for searching history for v1 just put the ui there it wont really work
- i want it to not look so empty when i start. as i add features it will feel more rounded out. for now put in a couple dummy things maybe nav bar etc.
- there will be one input for amazon search i.e. "lego" and another one for the chatgpt instructions i.e. "for 9 year old boy with great imagination"
- there should be a skeleton for where the items will apear (during first ui setup mae it a 1 sec delay so i can see it working) if you deem it appropaite make either a loader or some way the user can feel like something is happening.
for now, give stock images and fake prices and stars and description

## stack
- first we will build this in React vite tailwind shadcn supabase. (I did not yet give instructions for db that will come later when i thin more about ux for now we are trying to get a working slice) 
- once i have this working MVP i want to migrate to React native. This may be important when making decicions so it will be easier to migrate

## TO DO
- decide whether the product detail CTA on mobile should stay sticky at the bottom of the full-screen sheet or scroll naturally with the content
