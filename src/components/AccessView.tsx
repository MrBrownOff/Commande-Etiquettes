import React from 'react';
import { useAppStore, UserRole } from '../store/store';
import { Users, ShieldCheck, User } from 'lucide-react';
import { auth } from '../firebase';

// Panneau d'accès : liste les comptes ayant déjà ouvert l'application au moins
// une fois (un document de rôle n'existe qu'à partir de là, voir startRoleSync
// dans store.ts) et permet à un admin de corriger le rôle de n'importe lequel
// d'entre eux, sans devoir recréer le compte côté Firebase Auth.
export const AccessView: React.FC = () => {
  const { users, updateUserRole } = useAppStore();
  const currentUid = auth.currentUser?.uid;

  const sortedUsers = [...users].sort((a, b) => a.email.localeCompare(b.email, 'fr', { sensitivity: 'base' }));

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="text-orange-500" size={28} />
          Gestion des accès
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Rôle de chaque compte ayant déjà ouvert l'application (un nouveau compte apparaît ici
          après sa première connexion). Par défaut, le rôle est déduit de l'email — vous pouvez le
          corriger ici à tout moment, sans recréer le compte.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-xs divide-y divide-gray-100">
        {sortedUsers.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">Aucun compte enregistré pour le moment.</p>
        ) : (
          sortedUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-5 py-3 gap-4">
              <div className="flex items-center gap-3 min-w-0">
                {u.role === 'admin' ? (
                  <ShieldCheck size={18} className="text-orange-500 flex-shrink-0" />
                ) : (
                  <User size={18} className="text-gray-400 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-800 truncate">{u.email || u.id}</span>
                {u.id === currentUid && (
                  <span className="text-[10px] uppercase font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0">
                    Vous
                  </span>
                )}
              </div>

              <select
                value={u.role}
                disabled={u.id === currentUid}
                title={u.id === currentUid ? 'Impossible de modifier votre propre rôle ici' : undefined}
                onChange={(e) => updateUserRole(u.id, e.target.value as UserRole)}
                className="text-xs font-medium border border-gray-200 rounded-lg px-2.5 py-1.5 bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-orange-500 transition"
              >
                <option value="admin">Équipe interne</option>
                <option value="representant">Représentant</option>
              </select>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
