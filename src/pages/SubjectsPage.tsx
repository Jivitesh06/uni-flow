import { useState } from 'react';
import { Plus, Edit2, Trash2, BookOpen, Layers } from 'lucide-react';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useCollection } from '../hooks/useFirestore';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import toast from 'react-hot-toast';
import type { Subject } from '../types';

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#84cc16',
];

interface SubjectFormData {
  name: string;
  code: string;
  faculty: string;
  credits: number;
  color: string;
}

const defaultForm: SubjectFormData = {
  name: '',
  code: '',
  faculty: '',
  credits: 3,
  color: '#3b82f6',
};

export function SubjectsPage() {
  const { currentUser } = useAuth();
  const uid = currentUser?.uid ?? '';
  const { data: subjects, loading } = useCollection<Subject>(`users/${uid}/subjects`);
  const [showForm, setShowForm] = useState(false);
  const [editSubject, setEditSubject] = useState<Subject | null>(null);
  const [form, setForm] = useState<SubjectFormData>(defaultForm);
  const [saving, setSaving] = useState(false);

  function openAdd() {
    setForm(defaultForm);
    setEditSubject(null);
    setShowForm(true);
  }

  function openEdit(sub: Subject) {
    setForm({
      name: sub.name,
      code: sub.code,
      faculty: sub.faculty ?? '',
      credits: sub.credits,
      color: sub.color,
    });
    setEditSubject(sub);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('Subject name and code are required');
      return;
    }
    setSaving(true);
    try {
      const data = {
        uid,
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        faculty: form.faculty.trim() || undefined,
        credits: Number(form.credits) || 3,
        color: form.color,
        updatedAt: serverTimestamp(),
      };
      if (editSubject) {
        await updateDoc(doc(db, `users/${uid}/subjects/${editSubject.id}`), data);
        toast.success('Subject updated');
      } else {
        await addDoc(collection(db, `users/${uid}/subjects`), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success('Subject added');
      }
      setShowForm(false);
    } catch {
      toast.error('Failed to save subject');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(sub: Subject) {
    if (!confirm(`Delete "${sub.name}"? This will not delete past attendance logs.`)) return;
    try {
      await deleteDoc(doc(db, `users/${uid}/subjects/${sub.id}`));
      toast.success('Subject removed');
    } catch {
      toast.error('Failed to delete subject');
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 dark:text-white">Enrolled Subjects</h2>
          <p className="text-sm text-gray-500">Manage courses, instructors, and credit allocations</p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          Add Subject
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 rounded-full border-3 border-blue-600 border-t-transparent" />
        </div>
      ) : subjects.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No subjects enrolled</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
            Add your subjects here to begin scheduling timetable slots and recording attendance.
          </p>
          <Button onClick={openAdd} className="mt-5">
            Add Your First Subject
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map((sub) => (
            <Card key={sub.id} className="group hover:shadow-lg transition-all border-gray-100 dark:border-gray-800">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-black text-base shadow-sm flex-shrink-0"
                      style={{ backgroundColor: sub.color }}
                    >
                      {sub.code.slice(0, 3)}
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-gray-900 dark:text-white leading-tight">{sub.name}</h4>
                      <p className="text-xs font-mono font-medium text-blue-600 dark:text-blue-400 mt-0.5">{sub.code}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(sub)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(sub)}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-gray-400" /> {sub.credits} Credits
                  </span>
                  {sub.faculty && <span className="truncate max-w-[150px]">👤 {sub.faculty}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-gray-900 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-100 dark:border-gray-800">
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">
              {editSubject ? 'Edit Subject' : 'Add New Subject'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Subject Name</label>
                <Input
                  placeholder="e.g. Operating Systems"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Subject Code</label>
                  <Input
                    placeholder="CS401"
                    value={form.code}
                    onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                    className="mt-1 font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Credits</label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    value={form.credits}
                    onChange={(e) => setForm((f) => ({ ...f, credits: +e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Instructor / Faculty</label>
                <Input
                  placeholder="e.g. Prof. Alan Turing"
                  value={form.faculty}
                  onChange={(e) => setForm((f) => ({ ...f, faculty: e.target.value }))}
                  className="mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-gray-500">Badge Color</label>
                <div className="flex gap-2 mt-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, color: c }))}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        form.color === c ? 'scale-125 ring-2 ring-offset-2 ring-gray-400' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
              <Button className="flex-1" loading={saving} onClick={handleSave}>
                {editSubject ? 'Update Subject' : 'Save Subject'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
