import { Route, Routes } from 'react-router-dom'
import SiteLayout from '@/components/SiteLayout.jsx'
import AboutPage from '@/pages/AboutPage.jsx'
import AffiliateDisclosurePage from '@/pages/AffiliateDisclosurePage.jsx'
import ContactPage from '@/pages/ContactPage.jsx'
import HomePage from '@/pages/HomePage.jsx'
import NotFoundPage from '@/pages/NotFoundPage.jsx'
import PrivacyPage from '@/pages/PrivacyPage.jsx'

function App() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/affiliate-disclosure" element={<AffiliateDisclosurePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export default App
