import { Landing } from "@/components/landing/landing";

// الزائر العائد (4.1): جلسة مريض محفوظة تتخطى صفحة التعريف قبل أول رسم، فلا وميض.
const returning = `(function(){try{var s=JSON.parse(localStorage.getItem('rahma.patient.session')||'null');if(s&&s.refresh_expires_at>Date.now())location.replace('/patient')}catch(e){}})();`;

export default function Home() {
  return <><script dangerouslySetInnerHTML={{ __html: returning }} /><Landing /></>;
}
