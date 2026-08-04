/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { TopAppBar } from './components/layout/TopAppBar';
import { Footer } from './components/layout/Footer';
import { ProtectedRoute } from './components/ProtectedRoute';
import { PageLoader } from './components/ui/PageLoader';

// Lazy loaded routes for smaller first load
const Home = React.lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Analyze = React.lazy(() => import('./pages/Analyze').then(m => ({ default: m.Analyze })));
const History = React.lazy(() => import('./pages/History').then(m => ({ default: m.History })));
const Analysis = React.lazy(() => import('./pages/Analysis').then(m => ({ default: m.Analysis })));
const About = React.lazy(() => import('./pages/About').then(m => ({ default: m.About })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));
const SignUp = React.lazy(() => import('./pages/SignUp').then(m => ({ default: m.SignUp })));
const Profile = React.lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));

export default function App() {
  return (
    <Router>
      <div className="flex flex-col min-h-screen">
        <TopAppBar />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/analyze" element={<Analyze />} />
              <Route path="/history" element={<History />} />
              <Route path="/dashboard" element={<History />} />
              <Route path="/analysis/:id" element={<Analysis />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Routes>
        </Suspense>
        <Footer />
      </div>
    </Router>
  );
}
