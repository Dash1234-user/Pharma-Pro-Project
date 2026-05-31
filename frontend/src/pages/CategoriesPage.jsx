import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';

// ── Fetch helpers ─────────────────────────────────────────────────────────────
const fetchCategories = () => client.get('/categories').then(r => r.data);
const fetchProducts   = () => client.get('/products').then(r => r.data);

export default function CategoriesPage({ onAddCategory }) {
  const qc = useQueryClient();
  const [name, setName]     = useState('');
  const [desc, setDesc]     = useState('');
  const [editId, setEditId] = useState('');
  const [error, setError]   = useState('');

  const { data: categories = [], isLoading } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: products   = [] }            = useQuery({ queryKey: ['products'],   queryFn: fetchProducts   });

  // product count per category — mirrors getCatName logic in app.js
  const countMap = {};
  products.forEach(p => { countMap[p.category] = (countMap[p.category] || 0) + 1; });

  // category revenue — mirrors cat-stats in renderCategories()
  // NOTE: revenue calculation is done by /api/analysis on backend
  // Here we just show product counts — revenue is shown on Analysis page
  function resetForm() { setName(''); setDesc(''); setEditId(''); setError(''); }

  const saveMutation = useMutation({
    mutationFn: (payload) => editId
      ? client.put(`/categories/${editId}`, payload)
      : client.post('/categories', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categories'] });
      resetForm();
    },
    onError: (e) => setError(e.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/categories/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['categories'] }),
    onError: (e) => setError(e.response?.data?.error || 'Delete failed'),
  });

  function handleSave() {
    setError('');
    if (!name.trim()) { setError('Category name is required'); return; }
    saveMutation.mutate({ name: name.trim(), desc: desc.trim() });
  }

  function handleEdit(cat) {
    setName(cat.name);
    setDesc(cat.desc || '');
    setEditId(cat.id);
    setError('');
    document.getElementById('cat-name-input')?.focus();
  }

  function handleDelete(cat) {
    const count = countMap[cat.id] || 0;
    if (count > 0) { setError(`Cannot delete: ${count} medicine(s) use this category`); return; }
    if (!window.confirm('Delete this category?')) return;
    deleteMutation.mutate(cat.id);
  }

  return (
    <div style={{ padding: '20px 24px', maxWidth: 900, margin: '0 auto' }}>

      {/* Add / Edit form */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h3 className="card-title">{editId ? '✏️ Edit Category' : '+ New Category'}</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: '16px 20px' }}>
          <div className="form-group">
            <label className="form-label">Category Name *</label>
            <input id="cat-name-input" className="form-input" type="text"
              placeholder="e.g. Antibiotics, Vitamins…"
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>
          <div className="form-group">
            <label className="form-label">Description (optional)</label>
            <input className="form-input" type="text"
              placeholder="Short description"
              value={desc} onChange={e => setDesc(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSave()} />
          </div>
        </div>
        {error && <div style={{ color:'#ef4444', fontSize:13, padding:'0 20px 8px', fontWeight:600 }}>{error}</div>}
        <div style={{ display:'flex', gap:8, padding:'0 20px 16px' }}>
          <button className="btn-primary" onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : editId ? 'Update Category' : '+ Add Category'}
          </button>
          {editId && (
            <button className="btn-outline" onClick={resetForm}>Cancel</button>
          )}
        </div>
      </div>

      {/* Categories list */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">All Categories</h3>
          <span className="badge badge-blue">{categories.length} total</span>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign:'center', color:'#94a3b8' }}>Loading…</div>
        ) : categories.length === 0 ? (
          <div style={{ padding: 32, textAlign:'center', color:'#94a3b8', fontStyle:'italic' }}>
            No categories yet. Add your first category above.
          </div>
        ) : (
          <div style={{ padding: '8px 16px 16px' }}>
            <div id="categories-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {categories.map(cat => {
                const count = countMap[cat.id] || 0;
                return (
                  <div key={cat.id} className="cat-item">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="cat-item-name">{cat.name}</div>
                      {cat.desc && <div className="cat-item-desc">{cat.desc}</div>}
                      <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>
                        {count} medicine{count !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                      <button className="btn-icon" onClick={() => handleEdit(cat)}>✏️</button>
                      <button className="btn-icon" onClick={() => handleDelete(cat)}
                        disabled={deleteMutation.isPending}>🗑️</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
