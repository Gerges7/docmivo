/**
 * DocMivo V19: replace repeated generic tool-page prose with original,
 * tool-specific guidance grounded in actual QA examples, and check ads.txt.
 * Only changes generated Cloudflare dist, never the original repo tree.
 * Apply AFTER content-trust-hardening (V18.9).
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const W='https://getdocmivo.com';
const paragraphs={
 'merge-pdf':{
  steps:`<ol><li>اختر ملفين PDF أو أكثر، ثم راجع أسماء الملفات وأحجامها في القائمة.</li><li>استخدم السهمين بجانب كل ملف لتحديد ترتيب المستندات قبل الدمج؛ الترتيب المعروض هو ترتيب الصفحات النهائي.</li><li>اضغط «ابدأ العملية» وافتح الناتج للتحقق من أول وآخر صفحة عند كل انتقال بين ملفين.</li></ol>`,
  use:`<p>الدمج مناسب لجمع تقرير مع ملاحقه، أو فصل دراسي مع الأسئلة، أو مجموعة مستندات تريد تسليمها في ملف واحد. لو كان ملف من الملفات ممسوحًا ضوئيًا، سيبقى صورة داخل PDF؛ الدمج لا يحوّلها إلى نص قابل للبحث.</p><p>أحجام الصفحات المختلفة لا تتحول تلقائيًا إلى A4. احتفاظ كل صفحة بأبعادها الأصلية أفضل من تمديدها أو قصها دون إذن، لكن اعمل معاينة قبل الطباعة.</p>`,
  tips:`<ul><li>إذا أردت تقديم غلاف أولًا، انقله إلى أعلى قائمة الملفات قبل الضغط على زر الدمج.</li><li>لفحص ملف طويل، راجع عدد الصفحات الناتج وقارن مجموع صفحات الأصول، ثم راجع الانتقال بين ملف وآخر.</li><li>ملفات PDF المشفرة أو التالفة قد تمنع الدمج؛ لا ترفع مستندات خاصة إلى موقع آخر لحل المشكلة دون مراجعة سياسة الخصوصية.</li></ul>`,
  privacy:`<p>تُجمع الصفحات محليًا باستخدام مكتبة PDF داخل المتصفح؛ لا يتطلب الدمج إرسال الملفات إلى خادم DocMivo. يعتمد الأداء على ذاكرة جهازك وحجم ملفات PDF، لذلك قد تحتاج الملفات الضخمة إلى تقسيم العمل على دفعات.</p>`,
  qa:`<p>في عينة اختبار فعلية، دمجنا ملفين بإجمالي <strong>17 صفحة</strong>، ثم تحققنا من العدد والترتيب والتطابق البصري والنص القابل للنسخ. نجحت هذه العينة؛ لا تعني النتيجة أن جميع الملفات المشفرة أو التالفة مدعومة.</p>`,
  title:'كيف تدمج PDF وتتحقق من ترتيب الصفحات؟',caseTitle:'اختبار دمج موثق'
 },
 'split-pdf':{
  steps:`<ol><li>اختر ملف PDF، وافتحه لتعرف عدد صفحاته وترقيمها بدءًا من 1.</li><li>أدخل نطاقات التقسيم مفصولة بفاصلة منقوطة، مثل <code dir="ltr">1;2-17</code>، لإنشاء جزء أول بصفحة واحدة وجزء ثانٍ بباقي الصفحات.</li><li>نزّل ZIP وافتح كل PDF بداخله؛ لا تعتبر وجود ZIP وحده دليلًا على اكتمال التقسيم.</li></ol>`,
  use:`<p>التقسيم مفيد لفصل صفحة الغلاف عن المحتوى، أو تجهيز فصول تقرير للتسليم بشكل مستقل. كل نطاق يولّد جزءًا منفصلًا، ويظل ترتيب الصفحات داخل النطاق كما في الأصل.</p><p>المثال <code dir="ltr">1;2-17</code> يختلف عن <code dir="ltr">1,2-17</code> الذي يُستخدم في بعض أدوات اختيار الصفحات. انتبه للفاصل الذي تطلبه واجهة هذه الأداة بالذات.</p>`,
  tips:`<ul><li>إذا كان المستند من 17 صفحة، فإن <code dir="ltr">1;2-17</code> ينبغي أن ينتج ملفين بعدد صفحات 1 و16.</li><li>النطاقات الفارغة، مثل <code dir="ltr">1;;2-17</code>، تُرفض بدل تجاهلها وتصدير ملف ناقص.</li><li>افتح كل جزء بعد التنزيل، وتأكد من عدد الصفحات وبداية ونهاية النطاق قبل حذف المصدر.</li></ul>`,
  privacy:`<p>التقسيم يتم محليًا داخل المتصفح، ويولّد ملفات PDF ثم يجمعها في ZIP للتنزيل. كل نطاق يحتفظ بصفحات PDF الأصلية بدل إعادة رسمها كصور، ما يساعد على الحفاظ على النص الموجود.</p>`,
  qa:`<p>اختبرنا مستندًا من <strong>17 صفحة</strong> بالنطاقين <code dir="ltr">1;2-17</code>. احتوى ZIP الناتج على جزأين بصفحة و16 صفحة، وتمت مطابقة الصفحات بالمصدر في عينة الاختبار.</p>`,
  title:'تقسيم PDF إلى أجزاء محددة دون صفحات مفقودة',caseTitle:'اختبار نطاقات الصفحات'
 },
 'compress-pdf':{
  steps:`<ol><li>اختر PDF ثم حدّد طريقة الضغط. ابدأ بالوضع الذكي لحماية النص القابل للبحث إذا كان موجودًا.</li><li>للملفات الممسوحة الضوئية يمكنك تجربة جودة أو دقة أقل، لكن راجع أصغر كتابة والجداول بعد ذلك.</li><li>إذا لم ينتج ملف أصغر، تعرض الأداة رسالة بدل تنزيل نسخة أكبر وتسميتها «مضغوطة».</li></ol>`,
  use:`<p>الفرق الأساسي بين ملف PDF نصي وآخر مصور: الأول قد يحتوي خطوطًا ورسومات ونصوصًا قابلة للنسخ، والثاني قد تكون صفحاته صورًا كبيرة. الضغط البصري مفيد غالبًا للصور الممسوحة، لكنه قد يمحو طبقة النص لو أُجبر على ملف نصي.</p><p>في الوضع الذكي تحاول الأداة الاحتفاظ بالنص الموجود، بينما وضع «ضغط بالصور» يعيد رسم الصفحات صورًا؛ اختَر الثاني فقط إذا كنت تقبل هذا التغيير.</p>`,
  tips:`<ul><li>احتفظ دائمًا بالملف الأصلي، خصوصًا في العقود أو الملفات الموقّعة رقميًا؛ إعادة حفظ PDF قد تُبطل التوقيع.</li><li>لا تحكم على الجودة من حجم الملف فقط: كبّر أصغر خط داخل صفحة، وافحص حدود الجداول.</li><li>ملف نصي صغير أصلًا قد لا يصغر عند إعادة التعبئة، وهذه ليست مشكلة في المتصفح.</li></ul>`,
  privacy:`<p>يتم الفحص والضغط داخل متصفحك. النسخة البصرية قد تتطلب رسم كل صفحة على Canvas، وبالتالي يزداد استهلاك الذاكرة مع الصفحات ذات الدقة الكبيرة. لا تضع نتيجة الاختبار محل مراجعة المستند المهم.</p>`,
  qa:`<p>في تجربة على صفحة تشغيل أنظمة ممسوحة ضوئيًا، انخفض الحجم من نحو <strong>6.81 MB</strong> إلى <strong>0.89 MB</strong>، مع بقاء الصفحة مقروءة في الفحص البصري. هذه نسبة تخص العينة فقط، وليست وعدًا بنسبة ضغط ثابتة.</p>`,
  title:'ضغط PDF مع فهم الفرق بين الصور والنص',caseTitle:'مثال واقعي للضغط'
 },
 'ocr-pdf':{
  steps:`<ol><li>ارفع ملف PDF ممسوحًا واختَر لغة المستند. لو كان عربيًا وإنجليزيًا معًا اختَر اللغتين.</li><li>ابدأ بالوضع الذكي الذي يقرأ طبقة النص إن وُجدت؛ للنص المصور الصغير اختر «نص صغير — دقة أعلى» وجرّب «كتلة نص واحدة».</li><li>نزّل ملف TXT الناتج، ثم راجع الكلمات والأرقام والمسافات يدويًا في مقابل صورة الصفحة.</li></ol>`,
  use:`<p>OCR مناسب عندما تستطيع رؤية الكلمات على الصفحة لكن لا تستطيع تحديدها بالماوس. الأداة تستخرج <strong>TXT</strong>، ولا تُنشئ PDF جديدًا قابلًا للبحث. المستند النصي الأصلي لا يحتاج إلى OCR إضافي غالبًا.</p><p>في الصفحات متعددة الأعمدة، الجداول، أو النص الصغير، قد يتغير ترتيب الكلمات أو تلتصق الكلمات ببعضها. لهذا السبب تتوفر خيارات دقة القراءة وطريقة تحليل تخطيط الصفحة.</p>`,
  tips:`<ul><li>قبل التشغيل: عدّل ميل الصورة وقص الهوامش الفارغة وحسّن وضوح المسح لو أمكن.</li><li>في حال التصاق الكلمات، جرّب وضع التخطيط التلقائي بدل «كتلة نص واحدة» أو العكس، ولا تُدخل مسافات تخمينية تلقائيًا في نص حساس.</li><li>راجع بيانات الهوية والتواريخ والمبالغ دائمًا حرفًا بحرف؛ OCR مساعد وليس أداة تحقق قانونية.</li></ul>`,
  privacy:`<p>تعمل عملية قراءة النص داخل متصفحك باستخدام Tesseract. قد تُنزَّل ملفات المحرك واللغة أول مرة، لكن صفحة PDF لا تحتاج إرسالها إلى خادم DocMivo. الدقة الأعلى تعني وقتًا وذاكرة أكبر.</p>`,
  qa:`<p>تعرف OCR على <strong>5 من 5 أسطر</strong> صحيحة في عينة إنجليزية واضحة. في عينة أصغر تعرف على الأحرف والأرقام لكنه دمج بعض الكلمات مثل <code dir="ltr">DOCMIVOOCRQA</code>؛ لذلك ما زالت هذه الحالة تحتاج مراجعة بشرية.</p>`,
  title:'استخراج نص PDF الممسوح ومراجعة الدقة',caseTitle:'حدود OCR التي ظهرت في الاختبار'
 },
 'images-to-pdf':{
  steps:`<ol><li>اختر صور JPG أو PNG أو WebP، ولو عندك أكثر من صورة استخدم أسهم القائمة لتغيير ترتيب الصفحات.</li><li>ابدأ التحويل، ثم افتح ملف PDF الناتج وراجع اتجاه كل صورة وهوامشها.</li><li>تحقق من وضوح النص في الصور قبل إرسال PDF للطباعة، خاصة الصور التي التُقطت بكاميرا الهاتف.</li></ol>`,
  use:`<p>مفيد لتحويل صور أوراق أو شهادات إلى PDF واحد مرتب. الأداة تضع كل صورة في صفحة A4 مع الحفاظ على تناسب الأبعاد، وليست بديلًا عن مسح ضوئي يصحح الميل ويقتطع أطراف الورقة تلقائيًا.</p><p>الصور الشفافة قد تحتاج خلفية بيضاء للعرض في PDF بدل ظهورها على خلفية غير متوقعة. كما أن الصور الصغيرة لن تصبح أكثر دقة لمجرد وضعها داخل PDF.</p>`,
  tips:`<ul><li>ابدأ بالصور الأكبر دقة إن كنت ستطبع، وتجنب صور المراسلة المضغوطة متى توفرت النسخة الأصلية.</li><li>لو ظهرت صورة بالاتجاه الخطأ، عدّل اتجاهها قبل التحويل ثم أعد ترتيب القائمة.</li><li>راجع عدد الصفحات وترتيب الصورة الأولى والأخيرة، وتأكد من أن الأطراف لم تُقص.</li></ul>`,
  privacy:`<p>تُقرأ الصور وتُحوّل إلى صفحات PDF داخل المتصفح. الصور التي تحتوي مستندات شخصية تظل على جهازك في هذا المسار؛ لكن لا ترسل الملف الناتج إلى جهات لا تثق بها.</p>`,
  qa:`<p>في الاختبار حوّلنا <strong>3 صور</strong> بصيغ WebP وPNG وJPEG إلى 3 صفحات A4 بالترتيب المحدد، وراجعنا ظهور المساحات الشفافة بخلفية بيضاء بدل الأسود.</p>`,
  title:'جمع صور متعددة في PDF واحد دون فقدان الترتيب',caseTitle:'اختبار الصيغ والشفافية'
 },
 'extract-text':{
  steps:`<ol><li>اختر PDF يحتوي نصًا قابلًا للتحديد والنسخ أصلًا.</li><li>اضغط «ابدأ العملية» ثم افتح ملف TXT الناتج لقراءة النص بالترتيب الذي استطاع PDF توفيره.</li><li>لو ظهر تنبيه بأن الملف لا يحتوي نصًا قابلًا للنسخ، انتقل إلى OCR PDF بدل انتظار نتيجة فارغة.</li></ol>`,
  use:`<p>هذه الأداة تقرأ طبقة النص المخزنة داخل PDF. هي مناسبة للمستندات التي أُنشئت من محرر نصوص، وليست أداة للتعرف على الحروف من الصور. بعض الملفات تجمع صفحات نصية ومصورة، وقد تحتاج استخدام OCR على الصفحات المصورة فقط.</p><p>PDF يخزن الكلمات حسب مواضعها على الصفحة؛ لذلك قد يختلف ترتيب الأعمدة وصفوف الجداول في TXT، حتى لو كانت الأحرف كلها موجودة.</p>`,
  tips:`<ul><li>قارن الأسماء والأرقام بصفحة المصدر، ولا تعتمد على ترتيب TXT لإعادة إنشاء جدول دون مراجعة.</li><li>لو أردت الحفاظ على الشكل البصري، استخدم PDF نفسه؛ ملف TXT يحفظ النص فقط ولا يحتفظ بالجداول والصور.</li><li>إذا كان الملف مسحًا ضوئيًا بالكامل، ينبغي ظهور تنبيه واضح بدل تنزيل نص فارغ.</li></ul>`,
  privacy:`<p>تتم قراءة طبقة النص داخل المتصفح ولا يحتاج الاستخراج إلى رفع ملفك إلى خادم DocMivo. الملف الناتج TXT يمكن نسخه وتحريره، لكنه لا يحفظ التنسيق الأصلي.</p>`,
  qa:`<p>اختبرنا PDF من <strong>3 صفحات</strong> يحتوي العناوين ALPHA وBETA وGAMMA؛ ظهر النص بالترتيب. كما تأكدنا أن صفحة ممسوحة بلا نص تعرض رسالة إحالة إلى OCR بدل ملف فارغ.</p>`,
  title:'استخراج النص القابل للنسخ من PDF، وليس OCR',caseTitle:'اختبار النص والصورة'
 }
};
export const EDITORIAL_SLUGS=Object.freeze(Object.keys(paragraphs));
const escapeHtml=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function section(kind,body,title){return `<section class="content-block dm-verified-editorial dm-editorial-${kind}"><h2>${escapeHtml(title)}</h2>${body}</section>`;}
function replaceSectionByHeading(html,headingStart,replacement){
 let count=0;
 const next=html.replace(/<section\s+class=(['"])content-block(?:\s+v5-seo)?\1[^>]*>[\s\S]*?<\/section>/gi,block=>{
  const h=block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1]?.replace(/<[^>]+>/g,'').trim();
  if(h?.startsWith(headingStart)){count++;return replacement;}
  return block;
 });
 if(count!==1)throw new Error(`V19: expected one section beginning ${headingStart}, found ${count}`);
 return next;
}
export function improveToolPage(html,slug){
 const x=paragraphs[slug];if(!x)throw new Error('V19: unreviewed tool '+slug);
 if(html.includes('dm-verified-editorial'))throw new Error('V19: already patched '+slug);
 let out=String(html);
 if(!out.includes('</main>')||!out.includes('<section class="content-block v16-editorial">'))throw new Error('V19: tool page template changed '+slug);
 const expected={
  'merge-pdf':'دمج PDF','split-pdf':'تقسيم PDF','compress-pdf':'ضغط PDF',
  'ocr-pdf':'OCR PDF','images-to-pdf':'صور إلى PDF','extract-text':'استخراج النص'
 };
 out=replaceSectionByHeading(out,'كيفية استخدام أداة',section('steps',x.steps,x.title));
 out=replaceSectionByHeading(out,'متى تكون أداة',section('use',x.use,'متى تستخدم الأداة؟ وما حدودها؟'));
 out=replaceSectionByHeading(out,'نصائح للحصول على نتيجة أفضل',section('tips',x.tips,'كيف تتجنب الأخطاء الشائعة؟'));
 out=replaceSectionByHeading(out,'الخصوصية وطريقة المعالجة',section('privacy',x.privacy,'الخصوصية ومعالجة الملفات'));
 if(!out.includes(`<h1>${expected[slug]}</h1>`))throw new Error('V19: unexpected tool heading '+slug);
 const qa=section('qa',x.qa,x.caseTitle+' — من اختبارات DocMivo') + '\n';
 out=out.replace('<section class="content-block v16-editorial">',qa+'<section class="content-block v16-editorial">');
 return out;
}
const CONTACT_ORIGINAL='DocMivo يستخدم Google AdSense للإعلانات.';
const CONTACT_REPLACEMENT='DocMivo يسعى لاستيفاء متطلبات Google AdSense، وقد لا تكون الإعلانات مفعّلة حاليًا. وجود شيفرة التحقق من AdSense لا يعني أن الموقع حصل على الموافقة الإعلانية.';
export function improveContactPage(html){
 if(String(html).split(CONTACT_ORIGINAL).length!==2)throw new Error('V19: contact AdSense claim not found or duplicated');
 return html.replace(CONTACT_ORIGINAL,CONTACT_REPLACEMENT);
}
export function validateAdsTxt(value){
 const s=String(value||'').replace(/\r/g,'').trim();
 // Google seller record: exact structure, prevent extra unapproved sellers.
 if(!/^google\.com,\s*pub-\d{10,24},\s*DIRECT,\s*f08c47fec0942fa0$/i.test(s))throw new Error('V19: ads.txt missing or malformed');
 return true;
}
export const EDITORIAL_CSS=`\n/* DocMivo V19 — per-tool, evidence-based Arabic help content */\n.dm-verified-editorial{line-height:1.85}\n.dm-verified-editorial li{margin-block:8px}\n.dm-verified-editorial p{margin:10px 0}\n.dm-editorial-qa{background:#f8fafc;border:1px solid #cbd5e1;border-inline-start:4px solid #635bff;border-radius:15px;padding:18px 21px}\n.dm-editorial-qa h2{font-size:clamp(1.1rem,2.5vw,1.4rem)}\n.dm-verified-editorial code{direction:ltr;display:inline-block;unicode-bidi:isolate;background:#eef2ff;padding:0 5px;border-radius:4px}\n@media(max-width:650px){.dm-editorial-qa{padding:15px}.dm-verified-editorial{line-height:1.75}}\n`;

export function applyEditorialReadiness(dist){
 const targetPages=EDITORIAL_SLUGS.map(slug=>({slug,file:path.join(dist,'tools',slug,'index.html')}));
 const contact=path.join(dist,'contact.html'),ads=path.join(dist,'ads.txt'),css=path.join(dist,'assets/css/styles.css');
 for(const p of [...targetPages.map(x=>x.file),contact,ads,css])if(!fs.existsSync(p))throw new Error('V19: required file missing '+p);
 validateAdsTxt(fs.readFileSync(ads,'utf8'));
 const changes=targetPages.map(({slug,file})=>[file,improveToolPage(fs.readFileSync(file,'utf8'),slug)]);
 changes.push([contact,improveContactPage(fs.readFileSync(contact,'utf8'))]);
 const oldCss=fs.readFileSync(css,'utf8');
 if(oldCss.includes('DocMivo V19 —'))throw new Error('V19: CSS already patched');
 changes.push([css,oldCss+'\n'+EDITORIAL_CSS]);
 // All transformations validated before we modify the generated site.
 for(const [file,content] of changes)fs.writeFileSync(file,content);
 console.log(`DocMivo V19: ${targetPages.length} verified tools now have unique task-specific guides; contact claim corrected; ads.txt validated.`);
 return {editorialPages:targetPages.length,adsTxtValid:true};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const here=path.dirname(fileURLToPath(import.meta.url));
 applyEditorialReadiness(path.resolve(here,'../dist'));
}
