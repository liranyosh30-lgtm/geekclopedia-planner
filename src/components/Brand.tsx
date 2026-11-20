export default function Brand({ big = false }: { big?: boolean }) {
  return (
    <div className={`brand${big ? ' big' : ''}`}>
      <img className="brand-logo" src={`${import.meta.env.BASE_URL}geekclopedia-logo.svg`}
        alt="גיקלופדיה" width="684" height="120" />
    </div>
  );
}
