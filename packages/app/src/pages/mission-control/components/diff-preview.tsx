export function DiffPreview(props: { count: number }) {
  return (
    <div class="pl-4">
      <span class="text-12-regular text-text-weak">
        {props.count} {props.count === 1 ? "file" : "files"} changed
      </span>
    </div>
  )
}
