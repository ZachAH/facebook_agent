export default function ImagePreview({ url }) {
  if (!url) return null;
  return (
    <div className="image-preview">
      <img src={url} alt="Generated post graphic" loading="lazy" />
    </div>
  );
}
