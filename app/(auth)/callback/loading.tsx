import { Loader } from "lucide-react"

const loading = () => {
  return (
    <div className="h-screen flex justify-center items-center">
    <Loader className="h-10 w-10 animate-spin duration-300 text-blue-600" />
    </div>
  )
}
export default loading