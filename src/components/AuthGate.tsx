import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth } from '../firebase';
import { ArrowLeft, Loader2, Lock, Printer, Users } from 'lucide-react';

export const signOutUser = () => signOut(auth);

interface AuthGateProps {
  children: React.ReactNode;
}

type Portal = 'interne' | 'representant';

// Les deux portails mènent au même formulaire de connexion : c'est l'email du
// compte utilisé qui détermine la vue affichée une fois connecté (voir App.tsx).
// Le choix ici ne sert qu'à orienter l'utilisateur et adapter le texte affiché.
const PORTAL_LABELS: Record<Portal, string> = {
  interne: 'Équipe interne',
  representant: 'Représentants',
};

// N'affiche l'application que pour un utilisateur authentifié via Firebase Auth ;
// affiche un écran d'accueil puis de connexion (email/mot de passe) sinon.
export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [user, setUser] = useState<User | null | undefined>(undefined); // undefined = chargement initial
  const [portal, setPortal] = useState<Portal | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return unsubscribe;
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (user === undefined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-orange-500" size={32} />
      </div>
    );
  }

  if (user === null && portal === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-2xl text-center">
          <img
            src={`${import.meta.env.BASE_URL}Interbois-Logo-Blanc.png`}
            alt="Interbois"
            className="h-10 w-auto object-contain mx-auto mb-8 bg-slate-900 rounded-lg p-3"
          />
          <h1 className="text-xl font-bold text-slate-900 mb-8">Application de commande d'étiquettes</h1>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <button
              onClick={() => setPortal('interne')}
              className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 hover:border-orange-400 hover:shadow-xl transition flex flex-col items-center gap-3 text-slate-900"
            >
              <div className="p-3 rounded-full bg-orange-50 text-orange-500">
                <Users size={28} />
              </div>
              <span className="font-semibold">Marketing</span>
              <span className="text-xs text-gray-400">Gestion des étiquettes et des magasins</span>
            </button>

            <button
              onClick={() => setPortal('representant')}
              className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 hover:border-orange-400 hover:shadow-xl transition flex flex-col items-center gap-3 text-slate-900"
            >
              <div className="p-3 rounded-full bg-orange-50 text-orange-500">
                <Printer size={28} />
              </div>
              <span className="font-semibold">Représentants</span>
              <span className="text-xs text-gray-400">Sélection d'étiquettes à imprimer</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (user === null && portal !== null) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 px-4">
        <form
          onSubmit={handleSubmit}
          className="bg-white p-8 rounded-xl shadow-lg border border-gray-200 w-full max-w-sm space-y-4"
        >
          <button
            type="button"
            onClick={() => {
              setPortal(null);
              setError(null);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 transition -mb-1"
          >
            <ArrowLeft size={14} />
            Retour
          </button>

          <div className="flex items-center gap-2 justify-center text-slate-900 mb-2">
            <Lock size={22} />
            <h1 className="text-lg font-bold">Connexion — {PORTAL_LABELS[portal]}</h1>
          </div>

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
              Email
            </label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
              Mot de passe
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-gray-300 text-white font-medium py-2.5 rounded-lg text-sm transition"
          >
            {isSubmitting ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
};
