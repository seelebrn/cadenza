import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import { getAttributeNames, getAttributeValues } from '@shared/documentOps'

/** The case attributes of one document (see DocumentRecord.attributes),
 * shown under the reader's title as "Name: value" chips. Click a value to
 * edit it; × removes the attribute from this document; the add row
 * suggests names and values already used elsewhere in the project so the
 * same attribute is spelled the same way on every case. */
function CaseAttributes({ documentId }: { documentId: string }): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const setDocumentAttribute = useProjectStore((s) => s.setDocumentAttribute)
  const removeDocumentAttribute = useProjectStore((s) => s.removeDocumentAttribute)

  const [editingName, setEditingName] = useState<string | null>(null)
  const [valueDraft, setValueDraft] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newValue, setNewValue] = useState('')

  const document = data?.documents.find((d) => d.id === documentId)
  const allNames = useMemo(() => (data ? getAttributeNames(data) : []), [data])
  const suggestedValues = useMemo(
    () => (data && newName.trim() ? getAttributeValues(data, newName.trim()) : []),
    [data, newName]
  )
  const editingValues = useMemo(
    () => (data && editingName ? getAttributeValues(data, editingName) : []),
    [data, editingName]
  )
  if (!document) return <></>

  const entries = Object.entries(document.attributes)
  const missingElsewhere = allNames.filter((name) => !(name in document.attributes))

  function commitEdit(): void {
    if (editingName !== null) setDocumentAttribute(documentId, editingName, valueDraft)
    setEditingName(null)
  }

  function commitAdd(): void {
    const name = newName.trim()
    if (name) setDocumentAttribute(documentId, name, newValue)
    setNewName('')
    setNewValue('')
    setIsAdding(false)
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
      {entries.map(([name, value]) => (
        <span
          key={name}
          className="group inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600"
        >
          <span className="font-medium text-slate-500">{name}:</span>
          {editingName === name ? (
            <>
              <input
                autoFocus
                list={`attr-values-${name}`}
                className="w-28 rounded border border-slate-300 px-1 text-xs"
                value={valueDraft}
                onChange={(e) => setValueDraft(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdit()
                  if (e.key === 'Escape') setEditingName(null)
                }}
              />
              <datalist id={`attr-values-${name}`}>
                {editingValues.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          ) : (
            <button
              className={`hover:underline ${value ? '' : 'italic text-slate-400'}`}
              title="Click to edit"
              onClick={() => {
                setEditingName(name)
                setValueDraft(value)
              }}
            >
              {value || 'not set'}
            </button>
          )}
          <button
            className="ml-0.5 text-slate-300 hover:text-slate-600"
            title="Remove this attribute from this document"
            onClick={() => removeDocumentAttribute(documentId, name)}
          >
            ×
          </button>
        </span>
      ))}

      {isAdding ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            list="attr-names"
            className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs"
            placeholder="Attribute (e.g. Role)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setIsAdding(false)}
          />
          <datalist id="attr-names">
            {allNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          <input
            list="attr-new-values"
            className="w-28 rounded border border-slate-300 px-1 py-0.5 text-xs"
            placeholder="Value"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAdd()
              if (e.key === 'Escape') setIsAdding(false)
            }}
          />
          <datalist id="attr-new-values">
            {suggestedValues.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <button className="text-slate-700 hover:underline" onClick={commitAdd}>
            Add
          </button>
          <button className="text-slate-400 hover:underline" onClick={() => setIsAdding(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button
          className="text-slate-400 hover:text-slate-600 hover:underline"
          title={
            missingElsewhere.length > 0
              ? `Attributes used on other cases but not this one: ${missingElsewhere.join(', ')}`
              : 'Record a fact about this case (role, site, age…) to group and compare cases by it'
          }
          onClick={() => {
            setNewName(missingElsewhere[0] ?? '')
            setIsAdding(true)
          }}
        >
          + {entries.length === 0 ? 'Add case attribute' : 'attribute'}
        </button>
      )}
    </div>
  )
}

export default CaseAttributes
